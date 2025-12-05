import { v4 as uuidv4 } from 'uuid';

class EventStore {
  constructor(connectionPool, kafkaService) {
    this.connectionPool = connectionPool;
    this.kafkaService = kafkaService;
    this.eventHandlers = new Map();
  }

  async saveEvents(aggregateId, events, expectedVersion = -1) {
    const eventData = events.map((event, index) => ({
      id: uuidv4(),
      aggregateId,
      eventType: event.constructor.name,
      eventData: JSON.stringify(event),
      eventVersion: expectedVersion + index + 1,
      timestamp: new Date(),
      metadata: event.metadata || {}
    }));

    // Save to both MySQL and MongoDB
    await Promise.all([
      this.saveToMySQL(eventData),
      this.saveToMongoDB(eventData)
    ]);

    // Publish events to Kafka
    for (const event of eventData) {
      await this.kafkaService.produce('domain-events', {
        key: event.aggregateId,
        value: JSON.stringify(event),
        headers: {
          eventType: event.eventType,
          aggregateId: event.aggregateId,
          eventVersion: event.eventVersion.toString()
        }
      });
    }

    return eventData;
  }

  async saveToMySQL(events) {
    return await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const values = events.map(event => [
        event.id,
        event.aggregateId,
        event.eventType,
        event.eventData,
        event.eventVersion,
        event.timestamp,
        JSON.stringify(event.metadata)
      ]);

      const placeholders = events.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
      const flatValues = values.flat();

      await connection.execute(`
        INSERT INTO event_store 
        (id, aggregate_id, event_type, event_data, event_version, timestamp, metadata) 
        VALUES ${placeholders}
      `, flatValues);
    });
  }

  async saveToMongoDB(events) {
    const db = this.connectionPool.getMongoDatabase();
    await db.collection('event_store').insertMany(events);
  }

  async getEvents(aggregateId, fromVersion = 0) {
    // Try MongoDB first, fallback to MySQL
    try {
      return await this.getEventsFromMongoDB(aggregateId, fromVersion);
    } catch (error) {
      console.error('Failed to get events from MongoDB, trying MySQL:', error);
      return await this.getEventsFromMySQL(aggregateId, fromVersion);
    }
  }

  async getEventsFromMongoDB(aggregateId, fromVersion) {
    const db = this.connectionPool.getMongoDatabase();
    const events = await db.collection('event_store')
      .find({ 
        aggregateId, 
        eventVersion: { $gt: fromVersion } 
      })
      .sort({ eventVersion: 1 })
      .toArray();

    return events.map(event => ({
      ...event,
      eventData: JSON.parse(event.eventData)
    }));
  }

  async getEventsFromMySQL(aggregateId, fromVersion) {
    return await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT * FROM event_store WHERE aggregate_id = ? AND event_version > ? ORDER BY event_version',
        [aggregateId, fromVersion]
      );

      return rows.map(row => ({
        ...row,
        eventData: JSON.parse(row.event_data),
        metadata: JSON.parse(row.metadata)
      }));
    });
  }

  async getAllEvents(fromTimestamp = null) {
    const db = this.connectionPool.getMongoDatabase();
    const query = fromTimestamp ? { timestamp: { $gte: fromTimestamp } } : {};
    
    const events = await db.collection('event_store')
      .find(query)
      .sort({ timestamp: 1 })
      .toArray();

    return events.map(event => ({
      ...event,
      eventData: JSON.parse(event.eventData)
    }));
  }

  registerEventHandler(eventType, handler) {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    this.eventHandlers.get(eventType).push(handler);
  }

  async replayEvents(aggregateId, fromVersion = 0) {
    const events = await this.getEvents(aggregateId, fromVersion);
    
    for (const event of events) {
      const handlers = this.eventHandlers.get(event.eventType) || [];
      
      for (const handler of handlers) {
        try {
          await handler(event);
        } catch (error) {
          console.error(`Error replaying event ${event.id}:`, error);
        }
      }
    }

    return events.length;
  }

  async createSnapshot(aggregateId, version, data) {
    const snapshot = {
      id: uuidv4(),
      aggregateId,
      version,
      data: JSON.stringify(data),
      timestamp: new Date()
    };

    // Save to both databases
    await Promise.all([
      this.saveSnapshotToMySQL(snapshot),
      this.saveSnapshotToMongoDB(snapshot)
    ]);

    return snapshot;
  }

  async saveSnapshotToMySQL(snapshot) {
    return await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      await connection.execute(
        'INSERT INTO snapshots (id, aggregate_id, version, data, timestamp) VALUES (?, ?, ?, ?, ?)',
        [snapshot.id, snapshot.aggregateId, snapshot.version, snapshot.data, snapshot.timestamp]
      );
    });
  }

  async saveSnapshotToMongoDB(snapshot) {
    const db = this.connectionPool.getMongoDatabase();
    await db.collection('snapshots').insertOne(snapshot);
  }

  async getLatestSnapshot(aggregateId) {
    try {
      const db = this.connectionPool.getMongoDatabase();
      const snapshot = await db.collection('snapshots')
        .findOne({ aggregateId }, { sort: { version: -1 } });

      if (snapshot) {
        return {
          ...snapshot,
          data: JSON.parse(snapshot.data)
        };
      }
      return null;
    } catch (error) {
      console.error('Failed to get snapshot from MongoDB, trying MySQL:', error);
      return await this.getLatestSnapshotFromMySQL(aggregateId);
    }
  }

  async getLatestSnapshotFromMySQL(aggregateId) {
    return await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT * FROM snapshots WHERE aggregate_id = ? ORDER BY version DESC LIMIT 1',
        [aggregateId]
      );

      if (rows.length > 0) {
        return {
          ...rows[0],
          data: JSON.parse(rows[0].data)
        };
      }
      return null;
    });
  }
}

export default EventStore;