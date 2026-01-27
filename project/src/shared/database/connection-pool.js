import { createPool } from 'generic-pool';
import mysql from 'mysql2/promise';
import { MongoClient } from 'mongodb';

class InMemoryMySQLConnection {
  constructor() {
    this.tables = new Map();
  }

  async query(sql, params = []) {
    // Simple in-memory SQL simulation
    // This is a basic implementation for testing
    if (sql.toLowerCase().includes('insert')) {
      // Simulate insert
      return { insertId: Date.now(), affectedRows: 1 };
    } else if (sql.toLowerCase().includes('select')) {
      // Simulate select
      return [[]]; // Empty result
    } else if (sql.toLowerCase().includes('update')) {
      return { affectedRows: 1 };
    } else if (sql.toLowerCase().includes('delete')) {
      return { affectedRows: 1 };
    }
    return [];
  }

  async ping() {
    return true;
  }

  async end() {
    // No-op
  }
}

class InMemoryMongoDB {
  constructor() {
    this.collections = new Map();
  }

  collection(name) {
    if (!this.collections.has(name)) {
      this.collections.set(name, []);
    }
    return {
      find: (query) => ({
        toArray: async () => this.collections.get(name).filter(doc => {
          // Simple filter simulation
          return true;
        })
      }),
      insertOne: async (doc) => {
        this.collections.get(name).push(doc);
        return { insertedId: Date.now().toString() };
      },
      updateOne: async (filter, update) => {
        // Simple update
        return { modifiedCount: 1 };
      },
      deleteOne: async (filter) => {
        // Simple delete
        return { deletedCount: 1 };
      }
    };
  }
}

class DatabaseConnectionPool {
  constructor() {
    this.pools = new Map();
    this.isTest = process.env.NODE_ENV === 'test';
    this.initialize();
  }

  async initialize() {
    if (this.isTest) {
      // Use in-memory system for testing
      this.mysqlConnection = new InMemoryMySQLConnection();
      this.mongoDB = new InMemoryMongoDB();
    } else {
      // MySQL Connection Pool
      await this.createMySQLPool();
      
      // MongoDB Connection Pool
      await this.createMongoDBPool();
    }
  }

  async createMySQLPool() {
    const factory = {
      create: async () => {
        const connection = await mysql.createConnection({
          host: process.env.MYSQL_HOST || 'localhost',
          user: process.env.MYSQL_USER || 'root',
          password: process.env.MYSQL_PASSWORD || 'password',
          database: process.env.MYSQL_DATABASE || 'transaction_system',
          acquireTimeout: 60000,
          timeout: 60000,
          reconnect: true,
          multipleStatements: true
        });
        return connection;
      },
      destroy: async (connection) => {
        await connection.end();
      },
      validate: async (connection) => {
        try {
          await connection.ping();
          return true;
        } catch {
          return false;
        }
      }
    };

    const opts = {
      max: 20,
      min: 5,
      acquireTimeoutMillis: 30000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000,
      idleTimeoutMillis: 300000,
      reapIntervalMillis: 10000,
      createRetryIntervalMillis: 200,
      testOnBorrow: true,
      testOnReturn: true
    };

    this.pools.set('mysql', createPool(factory, opts));
  }

  async createMongoDBPool() {
    const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017/transaction_system', {
      maxPoolSize: 20,
      minPoolSize: 5,
      maxIdleTimeMS: 300000,
      waitQueueTimeoutMS: 30000,
      serverSelectionTimeoutMS: 30000,
      heartbeatFrequencyMS: 10000
    });

    await client.connect();
    this.mongoClient = client;
    this.mongoDB = client.db();
  }

  async getMySQLConnection() {
    if (this.isTest) {
      return this.mysqlConnection;
    }
    const pool = this.pools.get('mysql');
    return await pool.acquire();
  }

  async releaseMySQLConnection(connection) {
    if (this.isTest) {
      // No-op for in-memory
      return;
    }
    const pool = this.pools.get('mysql');
    await pool.release(connection);
  }

  getMongoDatabase() {
    if (this.isTest) {
      return this.mongoDB;
    }
    return this.mongoDB;
  }

  async executeWithMySQLConnection(operation) {
    if (this.isTest) {
      return await operation(this.mysqlConnection);
    }
    const connection = await this.getMySQLConnection();
    try {
      return await operation(connection);
    } finally {
      await this.releaseMySQLConnection(connection);
    }
  }

  getStats() {
    if (this.isTest) {
      return {
        mysql: { inMemory: true },
        mongodb: { inMemory: true }
      };
    }
    const stats = {};
    
    // MySQL stats
    const mysqlPool = this.pools.get('mysql');
    if (mysqlPool) {
      stats.mysql = {
        size: mysqlPool.size,
        available: mysqlPool.available,
        borrowed: mysqlPool.borrowed,
        pending: mysqlPool.pending,
        max: mysqlPool.max,
        min: mysqlPool.min
      };
    }

    // MongoDB stats would require custom tracking
    stats.mongodb = {
      connected: this.mongoClient ? this.mongoClient.topology.isConnected() : false
    };

    return stats;
  }

  async close() {
    if (this.isTest) {
      // No-op for in-memory
      return;
    }
    // Close all pools
    for (const [name, pool] of this.pools) {
      await pool.drain();
      await pool.clear();
    }

    if (this.mongoClient) {
      await this.mongoClient.close();
    }
  }
}

export default DatabaseConnectionPool;