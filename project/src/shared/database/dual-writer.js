import { KafkaService } from '../messaging/kafka-service.js';
import CircuitBreaker from '../patterns/circuit-breaker.js';
import RetryWithBackoff from '../patterns/retry-with-backoff.js';

class DualDatabaseWriter {
  constructor(connectionPool) {
    this.connectionPool = connectionPool;
    this.kafkaService = new KafkaService();
    
    // Circuit breakers for each database
    this.mysqlBreaker = new CircuitBreaker({
      timeout: 30000,
      errorThreshold: 50,
      resetTimeout: 60000
    });

    this.mongoBreaker = new CircuitBreaker({
      timeout: 30000,
      errorThreshold: 50,
      resetTimeout: 60000
    });

    this.spannerBreaker = new CircuitBreaker({
      timeout: 30000,
      errorThreshold: 50,
      resetTimeout: 60000
    });

    this.retryLogic = new RetryWithBackoff({
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000
    });
  }

  async writeToAllDatabases(data, options = {}) {
    const writeId = `write_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const results = {
      writeId,
      success: [],
      failures: [],
      timestamp: new Date().toISOString()
    };

    // Prepare write operations
    const operations = [
      this.writeToMySQL(data, writeId),
      this.writeToMongoDB(data, writeId),
      this.writeToSpanner(data, writeId)
    ];

    // Execute in parallel with individual error handling
    const promises = operations.map(async (operation, index) => {
      const dbNames = ['mysql', 'mongodb', 'spanner'];
      const dbName = dbNames[index];

      try {
        const result = await operation;
        results.success.push({
          database: dbName,
          result,
          timestamp: new Date().toISOString()
        });
        return { database: dbName, success: true, result };
      } catch (error) {
        results.failures.push({
          database: dbName,
          error: error.message,
          timestamp: new Date().toISOString()
        });
        
        // Queue for retry
        await this.queueFailedWrite(dbName, data, writeId, error);
        return { database: dbName, success: false, error };
      }
    });

    await Promise.allSettled(promises);

    // Publish write event
    await this.publishWriteEvent(writeId, results, data);

    // Handle consistency requirements
    if (options.requireAllDatabases && results.failures.length > 0) {
      await this.handleConsistencyFailure(writeId, results, data);
      throw new Error(`Failed to write to all databases. WriteId: ${writeId}`);
    }

    return results;
  }

  async writeToMySQL(data, writeId) {
    return await this.mysqlBreaker.execute(async () => {
      return await this.retryLogic.execute(async () => {
        return await this.connectionPool.executeWithMySQLConnection(async (connection) => {
          // Begin transaction
          await connection.beginTransaction();

          try {
            // Write to main table
            const [result] = await connection.execute(
              'INSERT INTO transactions (id, write_id, data, created_at) VALUES (?, ?, ?, NOW())',
              [data.id, writeId, JSON.stringify(data)]
            );

            // Write to audit log
            await connection.execute(
              'INSERT INTO write_audit (write_id, database_name, status, created_at) VALUES (?, ?, ?, NOW())',
              [writeId, 'mysql', 'success']
            );

            await connection.commit();
            return { insertId: result.insertId, affectedRows: result.affectedRows };
          } catch (error) {
            await connection.rollback();
            throw error;
          }
        });
      });
    });
  }

  async writeToMongoDB(data, writeId) {
    return await this.mongoBreaker.execute(async () => {
      return await this.retryLogic.execute(async () => {
        const db = this.connectionPool.getMongoDatabase();
        const session = db.client.startSession();

        try {
          return await session.withTransaction(async () => {
            // Write to main collection
            const result = await db.collection('transactions').insertOne({
              ...data,
              writeId,
              createdAt: new Date()
            }, { session });

            // Write to audit collection
            await db.collection('write_audit').insertOne({
              writeId,
              databaseName: 'mongodb',
              status: 'success',
              createdAt: new Date()
            }, { session });

            return { insertedId: result.insertedId };
          });
        } finally {
          await session.endSession();
        }
      });
    });
  }

  async writeToSpanner(data, writeId) {
    return await this.spannerBreaker.execute(async () => {
      return await this.retryLogic.execute(async () => {
        // Simulate Google Spanner write
        // In real implementation, use @google-cloud/spanner
        await new Promise(resolve => setTimeout(resolve, 100));
        
        return {
          commitTimestamp: new Date().toISOString(),
          writeId
        };
      });
    });
  }

  async queueFailedWrite(database, data, writeId, error) {
    const failedWrite = {
      database,
      data,
      writeId,
      error: error.message,
      timestamp: new Date().toISOString(),
      retryCount: 0,
      maxRetries: 5
    };

    // Send to Kafka for retry processing
    await this.kafkaService.produce('failed-writes', {
      key: writeId,
      value: JSON.stringify(failedWrite)
    });

    // Also queue in RabbitMQ for immediate retry
    // Implementation would go here
  }

  async publishWriteEvent(writeId, results, data) {
    const event = {
      eventType: 'DATABASE_WRITE',
      writeId,
      results,
      data: {
        id: data.id,
        type: data.type
      },
      timestamp: new Date().toISOString()
    };

    await this.kafkaService.produce('database-events', {
      key: writeId,
      value: JSON.stringify(event)
    });
  }

  async handleConsistencyFailure(writeId, results, data) {
    // Implement compensation logic
    const compensationEvent = {
      eventType: 'COMPENSATION_REQUIRED',
      writeId,
      successfulWrites: results.success,
      failedWrites: results.failures,
      data,
      timestamp: new Date().toISOString()
    };

    await this.kafkaService.produce('compensation-events', {
      key: writeId,
      value: JSON.stringify(compensationEvent)
    });

    // Trigger rollback for successful writes if needed
    await this.triggerRollback(writeId, results.success);
  }

  async triggerRollback(writeId, successfulWrites) {
    for (const write of successfulWrites) {
      try {
        switch (write.database) {
          case 'mysql':
            await this.rollbackMySQL(writeId);
            break;
          case 'mongodb':
            await this.rollbackMongoDB(writeId);
            break;
          case 'spanner':
            await this.rollbackSpanner(writeId);
            break;
        }
      } catch (error) {
        console.error(`Failed to rollback ${write.database} for writeId ${writeId}:`, error);
      }
    }
  }

  async rollbackMySQL(writeId) {
    return await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      await connection.execute(
        'DELETE FROM transactions WHERE write_id = ?',
        [writeId]
      );
    });
  }

  async rollbackMongoDB(writeId) {
    const db = this.connectionPool.getMongoDatabase();
    await db.collection('transactions').deleteMany({ writeId });
  }

  async rollbackSpanner(writeId) {
    // Implement Spanner rollback
    console.log(`Rolling back Spanner write for writeId: ${writeId}`);
  }

  getStats() {
    return {
      mysql: this.mysqlBreaker.getState(),
      mongodb: this.mongoBreaker.getState(),
      spanner: this.spannerBreaker.getState()
    };
  }
}

export default DualDatabaseWriter;