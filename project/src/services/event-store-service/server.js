import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import DatabaseConnectionPool from '../../shared/database/connection-pool.js';
import DualDatabaseWriter from '../../shared/database/dual-writer.js';
import { KafkaService } from '../../shared/messaging/kafka-service.js';
import winston from 'winston';

const app = express();
const PORT = process.env.EVENT_STORE_SERVICE_PORT || 3012;

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/event-store-service.log' })
  ]
});

// Initialize dependencies
const connectionPool = new DatabaseConnectionPool();
const kafkaService = new KafkaService();
const dualWriter = new DualDatabaseWriter(connectionPool);

// Event store for replay capabilities
const eventStore = new Map();

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));

// Routes
app.post('/events', async (req, res) => {
  try {
    const { aggregateId, aggregateType, eventType, eventData, metadata } = req.body;

    // Store event logic here
    const event = {
      id: uuidv4(),
      aggregateId,
      aggregateType,
      eventType,
      eventData,
      metadata: metadata || {},
      version: await getNextVersion(aggregateId),
      timestamp: new Date().toISOString()
    };

    // Write to databases
    await dualWriter.writeToAllDatabases(event);

    // Store in memory for replay
    if (!eventStore.has(aggregateId)) {
      eventStore.set(aggregateId, []);
    }
    eventStore.get(aggregateId).push(event);

    // Publish event stored
    await kafkaService.produce('event-store-events', {
      eventType: 'EVENT_STORED',
      eventId: event.id,
      aggregateId: event.aggregateId,
      aggregateType: event.aggregateType,
      timestamp: event.timestamp
    });

    res.status(201).json({
      success: true,
      data: event,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error storing event:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/events/:aggregateId', async (req, res) => {
  try {
    const { fromVersion, toVersion } = req.query;

    // Get events for aggregate logic here
    const events = await getEventsForAggregate(req.params.aggregateId, {
      fromVersion: fromVersion ? parseInt(fromVersion) : null,
      toVersion: toVersion ? parseInt(toVersion) : null
    });

    res.json({
      success: true,
      data: events,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting events for aggregate:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/events', async (req, res) => {
  try {
    const { aggregateType, eventType, startDate, endDate, page = 1, limit = 20 } = req.query;

    // Get events with filters logic here
    const events = await getEvents({
      aggregateType,
      eventType,
      startDate,
      endDate,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      data: events,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting events:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/replay/:aggregateId', async (req, res) => {
  try {
    const { fromVersion, toVersion } = req.body;

    // Replay events for aggregate logic here
    const replayResult = await replayEvents(req.params.aggregateId, {
      fromVersion,
      toVersion
    });

    res.json({
      success: true,
      data: replayResult,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error replaying events:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/snapshots/:aggregateId', async (req, res) => {
  try {
    // Get snapshot for aggregate logic here
    const snapshot = await getSnapshot(req.params.aggregateId);

    if (!snapshot) {
      return res.status(404).json({
        success: false,
        error: 'Snapshot not found',
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: snapshot,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting snapshot:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/snapshots/:aggregateId', async (req, res) => {
  try {
    const { state, version } = req.body;

    // Create snapshot logic here
    const snapshot = {
      id: uuidv4(),
      aggregateId: req.params.aggregateId,
      state,
      version,
      createdAt: new Date().toISOString()
    };

    // Write to databases
    await dualWriter.writeToAllDatabases(snapshot);

    res.status(201).json({
      success: true,
      data: snapshot,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error creating snapshot:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/aggregates/:aggregateId/state', async (req, res) => {
  try {
    // Rebuild aggregate state logic here
    const state = await rebuildAggregateState(req.params.aggregateId);

    res.json({
      success: true,
      data: state,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error rebuilding aggregate state:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Advanced event store functionality
app.get('/events/stream/:aggregateId', async (req, res) => {
  try {
    const { fromVersion = 1 } = req.query;

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const events = await getEventsForAggregate(req.params.aggregateId, {
      fromVersion: parseInt(fromVersion)
    });

    // Send existing events
    for (const event of events) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    // Keep connection alive
    const keepAlive = setInterval(() => {
      res.write(': keep-alive\n\n');
    }, 30000);

    // Clean up on client disconnect
    req.on('close', () => {
      clearInterval(keepAlive);
    });

  } catch (error) {
    logger.error('Error streaming events:', error);
    res.status(500).end();
  }
});

app.post('/events/batch', async (req, res) => {
  try {
    const { events } = req.body;

    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Events array is required',
        timestamp: new Date().toISOString()
      });
    }

    const storedEvents = await storeEventsBatch(events);

    res.status(201).json({
      success: true,
      data: storedEvents,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error storing event batch:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/events/search', async (req, res) => {
  try {
    const { query, aggregateType, eventType, startDate, endDate, page = 1, limit = 20 } = req.query;

    const results = await searchEvents({
      query,
      aggregateType,
      eventType,
      startDate,
      endDate,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      data: results,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error searching events:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/projections/:name', async (req, res) => {
  try {
    const { aggregateType, eventTypes, initialState = {} } = req.body;

    const projection = await createProjection(req.params.name, {
      aggregateType,
      eventTypes,
      initialState
    });

    res.status(201).json({
      success: true,
      data: projection,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error creating projection:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/projections/:name', async (req, res) => {
  try {
    const projection = await getProjection(req.params.name);

    if (!projection) {
      return res.status(404).json({
        success: false,
        error: 'Projection not found',
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: projection,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting projection:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.put('/projections/:name', async (req, res) => {
  try {
    const { rebuild = false } = req.query;

    const result = await updateProjection(req.params.name, { rebuild: rebuild === 'true' });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error updating projection:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/sagas', async (req, res) => {
  try {
    const { sagaType, initiatingEvent, steps } = req.body;

    const saga = await createSaga({
      sagaType,
      initiatingEvent,
      steps
    });

    res.status(201).json({
      success: true,
      data: saga,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error creating saga:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/sagas/:sagaId', async (req, res) => {
  try {
    const saga = await getSaga(req.params.sagaId);

    if (!saga) {
      return res.status(404).json({
        success: false,
        error: 'Saga not found',
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: saga,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting saga:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/sagas/:sagaId/events', async (req, res) => {
  try {
    const { eventType, eventData } = req.body;

    const result = await processSagaEvent(req.params.sagaId, {
      eventType,
      eventData
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error processing saga event:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/events/archive', async (req, res) => {
  try {
    const { aggregateType, beforeDate, archivePath } = req.body;

    const result = await archiveEvents({
      aggregateType,
      beforeDate,
      archivePath
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error archiving events:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/events/statistics', async (req, res) => {
  try {
    const { aggregateType, startDate, endDate } = req.query;

    const statistics = await getEventStatistics({
      aggregateType,
      startDate,
      endDate
    });

    res.json({
      success: true,
      data: statistics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting event statistics:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/events/validate', async (req, res) => {
  try {
    const { event } = req.body;

    const validation = await validateEvent(event);

    res.json({
      success: true,
      data: validation,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error validating event:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/events/correlation/:correlationId', async (req, res) => {
  try {
    const correlatedEvents = await getCorrelatedEvents(req.params.correlationId);

    res.json({
      success: true,
      data: correlatedEvents,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting correlated events:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/events/transform', async (req, res) => {
  try {
    const { events, transformation } = req.body;

    const transformedEvents = await transformEvents(events, transformation);

    res.json({
      success: true,
      data: transformedEvents,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error transforming events:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'event-store-service',
    timestamp: new Date().toISOString(),
    dependencies: {
      database: connectionPool.getStats(),
      dualWriter: dualWriter.getStats()
    },
    stats: {
      totalAggregates: eventStore.size,
      totalEvents: Array.from(eventStore.values()).reduce((sum, events) => sum + events.length, 0)
    }
  });
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
  res.json({
    service: 'event-store-service',
    timestamp: new Date().toISOString(),
    database: connectionPool.getStats(),
    dualWriter: dualWriter.getStats(),
    eventStore: {
      totalAggregates: eventStore.size,
      totalEvents: Array.from(eventStore.values()).reduce((sum, events) => sum + events.length, 0)
    }
  });
});

// Helper functions
async function getNextVersion(aggregateId) {
  const events = eventStore.get(aggregateId) || [];
  return events.length + 1;
}

async function getEventsForAggregate(aggregateId, options) {
  const { fromVersion = 1, toVersion, limit = 1000 } = options;

  let query = `
    SELECT * FROM events
    WHERE aggregate_id = ?
    AND version >= ?
    ORDER BY version ASC
  `;
  let params = [aggregateId, fromVersion];

  if (toVersion) {
    query += ' AND version <= ?';
    params.push(toVersion);
  }

  query += ' LIMIT ?';
  params.push(limit);

  const events = await connectionPool.executeWithMySQLConnection(async (connection) => {
    const [rows] = await connection.execute(query, params);
    return rows;
  });

  return events.map(row => ({
    ...row,
    data: JSON.parse(row.data),
    metadata: JSON.parse(row.metadata || '{}')
  }));
}

async function getEvents(filters) {
  try {
    const { aggregateType, eventType, startDate, endDate, page, limit } = filters;

    let whereClause = [];
    let params = [];

    if (aggregateType) {
      whereClause.push('aggregate_type = ?');
      params.push(aggregateType);
    }

    if (eventType) {
      whereClause.push('event_type = ?');
      params.push(eventType);
    }

    if (startDate) {
      whereClause.push('timestamp >= ?');
      params.push(startDate);
    }

    if (endDate) {
      whereClause.push('timestamp <= ?');
      params.push(endDate);
    }

    const whereStr = whereClause.length > 0 ? `WHERE ${whereClause.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    const events = await connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT * FROM events ${whereStr} ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );
      return rows;
    });

    return events.map(event => ({
      id: event.id,
      aggregateId: event.aggregate_id,
      aggregateType: event.aggregate_type,
      eventType: event.event_type,
      eventData: JSON.parse(event.event_data),
      metadata: JSON.parse(event.metadata || '{}'),
      version: event.version,
      timestamp: event.timestamp
    }));
  } catch (error) {
    logger.error('Error getting events:', error);
    throw error;
  }
}

async function replayEvents(aggregateId, options) {
  const events = await getEventsForAggregate(aggregateId, options);

  // Replay logic - apply events to rebuild state
  let state = {};

  for (const event of events) {
    // Apply event to state based on event type
    state = applyEvent(state, event);
  }

  return {
    aggregateId,
    finalState: state,
    eventsReplayed: events.length,
    lastVersion: events.length > 0 ? events[events.length - 1].version : 0
  };
}

async function getSnapshot(aggregateId) {
  try {
    const snapshot = await connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT * FROM snapshots WHERE aggregate_id = ? ORDER BY version DESC LIMIT 1',
        [aggregateId]
      );
      return rows[0];
    });

    if (!snapshot) return null;

    return {
      id: snapshot.id,
      aggregateId: snapshot.aggregate_id,
      state: JSON.parse(snapshot.state),
      version: snapshot.version,
      createdAt: snapshot.created_at
    };
  } catch (error) {
    logger.error('Error getting snapshot:', error);
    throw error;
  }
}

async function rebuildAggregateState(aggregateId) {
  const result = await replayEvents(aggregateId, {});
  return result.finalState;
}

function applyEvent(state, event) {
  // Event application logic based on aggregate type and event type
  switch (event.aggregateType) {
    case 'Transaction':
      return applyTransactionEvent(state, event);
    case 'User':
      return applyUserEvent(state, event);
    case 'Account':
      return applyAccountEvent(state, event);
    default:
      // Generic application for unknown aggregate types
      return { ...state, ...event.eventData };
  }
}

function applyTransactionEvent(state, event) {
  switch (event.eventType) {
    case 'TransactionCreated':
      return {
        id: event.aggregateId,
        userId: event.eventData.userId,
        amount: event.eventData.amount,
        currency: event.eventData.currency,
        type: event.eventData.type,
        status: 'pending', // Initial status
        createdAt: event.timestamp,
        updatedAt: event.timestamp,
        ...event.eventData
      };
    case 'TransactionStatusUpdated':
      return {
        ...state,
        status: event.eventData.newStatus,
        updatedAt: event.timestamp,
        statusHistory: [
          ...(state.statusHistory || []),
          {
            status: event.eventData.newStatus,
            timestamp: event.timestamp,
            reason: event.eventData.reason
          }
        ]
      };
    case 'TransactionAmountUpdated':
      return {
        ...state,
        amount: event.eventData.newAmount,
        updatedAt: event.timestamp,
        amountHistory: [
          ...(state.amountHistory || []),
          {
            amount: event.eventData.newAmount,
            oldAmount: event.eventData.oldAmount,
            timestamp: event.timestamp,
            reason: event.eventData.reason
          }
        ]
      };
    case 'TransactionCancelled':
      return {
        ...state,
        status: 'cancelled',
        cancelledAt: event.timestamp,
        cancelledBy: event.eventData.cancelledBy,
        cancellationReason: event.eventData.reason,
        updatedAt: event.timestamp
      };
    default:
      return state;
  }
}

function applyUserEvent(state, event) {
  switch (event.eventType) {
    case 'UserCreated':
      return {
        id: event.aggregateId,
        ...event.eventData,
        createdAt: event.timestamp,
        updatedAt: event.timestamp
      };
    case 'UserUpdated':
      return {
        ...state,
        ...event.eventData,
        updatedAt: event.timestamp
      };
    default:
      return state;
  }
}

function applyAccountEvent(state, event) {
  switch (event.eventType) {
    case 'AccountCreated':
      return {
        id: event.aggregateId,
        ...event.eventData,
        balance: 0,
        createdAt: event.timestamp,
        updatedAt: event.timestamp
      };
    case 'AccountBalanceUpdated':
      return {
        ...state,
        balance: event.eventData.newBalance,
        updatedAt: event.timestamp,
        balanceHistory: [
          ...(state.balanceHistory || []),
          {
            balance: event.eventData.newBalance,
            timestamp: event.timestamp,
            reason: event.eventData.reason
          }
        ]
      };
    default:
      return state;
  }
}

// Advanced event store helper functions

async function storeEventsBatch(events) {
  return await connectionPool.executeWithMySQLConnection(async (connection) => {
    await connection.beginTransaction();

    const storedEvents = [];

    try {
      for (const event of events) {
        // Check for duplicates
        const [existing] = await connection.execute(
          'SELECT id FROM events WHERE aggregate_id = ? AND version = ?',
          [event.aggregateId, event.version]
        );

        if (existing.length > 0) {
          throw new Error(`Event already exists: ${event.aggregateId}:${event.version}`);
        }

        const eventId = uuidv4();
        const timestamp = new Date().toISOString();

        await connection.execute(
          `INSERT INTO events (id, aggregate_id, aggregate_type, event_type, version, data, metadata, timestamp, correlation_id, causation_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            eventId,
            event.aggregateId,
            event.aggregateType,
            event.eventType,
            event.version,
            JSON.stringify(event.data),
            JSON.stringify(event.metadata || {}),
            timestamp,
            event.correlationId || null,
            event.causationId || null
          ]
        );

        storedEvents.push({
          id: eventId,
          ...event,
          timestamp
        });
      }

      await connection.commit();
      return storedEvents;

    } catch (error) {
      await connection.rollback();
      throw error;
    }
  });
}

async function searchEvents(criteria) {
  const { query, aggregateType, eventType, startDate, endDate, page, limit } = criteria;

  let sql = 'SELECT * FROM events WHERE 1=1';
  const params = [];

  if (query) {
    sql += ' AND (data LIKE ? OR metadata LIKE ?)';
    params.push(`%${query}%`, `%${query}%`);
  }

  if (aggregateType) {
    sql += ' AND aggregate_type = ?';
    params.push(aggregateType);
  }

  if (eventType) {
    sql += ' AND event_type = ?';
    params.push(eventType);
  }

  if (startDate) {
    sql += ' AND timestamp >= ?';
    params.push(startDate);
  }

  if (endDate) {
    sql += ' AND timestamp <= ?';
    params.push(endDate);
  }

  sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
  params.push(limit, (page - 1) * limit);

  const result = await connectionPool.executeWithMySQLConnection(async (connection) => {
    const [rows] = await connection.execute(sql, params);
    return rows;
  });

  return {
    events: result.map(row => ({
      ...row,
      data: JSON.parse(row.data),
      metadata: JSON.parse(row.metadata || '{}')
    })),
    pagination: {
      page,
      limit,
      total: result.length // In production, you'd want a separate COUNT query
    }
  };
}

async function createProjection(name, config) {
  const { aggregateType, eventTypes, initialState } = config;

  const projectionId = uuidv4();

  await connectionPool.executeWithMySQLConnection(async (connection) => {
    await connection.execute(
      `INSERT INTO projections (id, name, aggregate_type, event_types, state, last_event_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NULL, NOW(), NOW())`,
      [
        projectionId,
        name,
        aggregateType,
        JSON.stringify(eventTypes),
        JSON.stringify(initialState)
      ]
    );
  });

  return {
    id: projectionId,
    name,
    ...config,
    state: initialState,
    createdAt: new Date()
  };
}

async function getProjection(name) {
  const rows = await connectionPool.executeWithMySQLConnection(async (connection) => {
    const [rows] = await connection.execute(
      'SELECT * FROM projections WHERE name = ?',
      [name]
    );
    return rows;
  });

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    ...row,
    eventTypes: JSON.parse(row.event_types),
    state: JSON.parse(row.state)
  };
}

async function updateProjection(name, options = {}) {
  const projection = await getProjection(name);
  if (!projection) {
    throw new Error('Projection not found');
  }

  if (options.rebuild) {
    // Rebuild projection from scratch
    const eventTypes = projection.eventTypes;
    const events = await connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT * FROM events WHERE aggregate_type = ? AND event_type IN (?) ORDER BY timestamp ASC',
        [projection.aggregate_type, eventTypes]
      );
      return rows;
    });

    let state = JSON.parse(projection.initial_state || '{}');

    for (const event of events) {
      state = applyEventToProjection(state, JSON.parse(event.data), event.event_type);
    }

    await connectionPool.executeWithMySQLConnection(async (connection) => {
      await connection.execute(
        'UPDATE projections SET state = ?, updated_at = NOW() WHERE name = ?',
        [JSON.stringify(state), name]
      );
    });

    return { rebuilt: true, state };
  }

  return { updated: true };
}

function applyEventToProjection(state, eventData, eventType) {
  // Simple projection logic - in real implementation, this would be more sophisticated
  switch (eventType) {
    case 'AccountCreated':
      return { ...state, accounts: (state.accounts || 0) + 1 };
    case 'TransactionCompleted':
      return {
        ...state,
        transactions: (state.transactions || 0) + 1,
        totalAmount: (state.totalAmount || 0) + (eventData.amount || 0)
      };
    default:
      return state;
  }
}

async function createSaga(config) {
  const { sagaType, initiatingEvent, steps } = config;

  const sagaId = uuidv4();
  const now = new Date();

  await connectionPool.executeWithMySQLConnection(async (connection) => {
    await connection.execute(
      `INSERT INTO sagas (id, saga_type, initiating_event, steps, current_step, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, 'pending', ?, ?)`,
      [
        sagaId,
        sagaType,
        JSON.stringify(initiatingEvent),
        JSON.stringify(steps),
        now,
        now
      ]
    );
  });

  return {
    id: sagaId,
    ...config,
    currentStep: 0,
    status: 'pending',
    createdAt: now
  };
}

async function getSaga(sagaId) {
  const rows = await connectionPool.executeWithMySQLConnection(async (connection) => {
    const [rows] = await connection.execute(
      'SELECT * FROM sagas WHERE id = ?',
      [sagaId]
    );
    return rows;
  });

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    ...row,
    initiatingEvent: JSON.parse(row.initiating_event),
    steps: JSON.parse(row.steps),
    completedSteps: JSON.parse(row.completed_steps || '[]'),
    failedSteps: JSON.parse(row.failed_steps || '[]')
  };
}

async function processSagaEvent(sagaId, event) {
  const saga = await getSaga(sagaId);
  if (!saga) {
    throw new Error('Saga not found');
  }

  const { steps, currentStep, status } = saga;

  if (status === 'completed' || status === 'failed') {
    return { sagaId, status, message: 'Saga already finished' };
  }

  const currentStepConfig = steps[currentStep];
  if (!currentStepConfig) {
    // Saga completed
    await connectionPool.executeWithMySQLConnection(async (connection) => {
      await connection.execute(
        'UPDATE sagas SET status = ?, updated_at = NOW() WHERE id = ?',
        ['completed', sagaId]
      );
    });
    return { sagaId, status: 'completed', message: 'Saga completed successfully' };
  }

  // Check if event matches expected event for current step
  if (event.eventType === currentStepConfig.expectedEvent) {
    // Step completed successfully
    const completedSteps = [...(saga.completedSteps || []), {
      step: currentStep,
      event: event.eventType,
      timestamp: new Date()
    }];

    await connectionPool.executeWithMySQLConnection(async (connection) => {
      await connection.execute(
        `UPDATE sagas SET current_step = ?, completed_steps = ?, updated_at = NOW() WHERE id = ?`,
        [currentStep + 1, JSON.stringify(completedSteps), sagaId]
      );
    });

    return {
      sagaId,
      status: 'in_progress',
      currentStep: currentStep + 1,
      message: `Step ${currentStep} completed`
    };
  } else if (currentStepConfig.timeout && event.eventType === 'SagaTimeout') {
    // Handle timeout
    const failedSteps = [...(saga.failedSteps || []), {
      step: currentStep,
      reason: 'timeout',
      timestamp: new Date()
    }];

    await connectionPool.executeWithMySQLConnection(async (connection) => {
      await connection.execute(
        `UPDATE sagas SET status = ?, failed_steps = ?, updated_at = NOW() WHERE id = ?`,
        ['failed', JSON.stringify(failedSteps), sagaId]
      );
    });

    return { sagaId, status: 'failed', message: 'Saga failed due to timeout' };
  }

  return { sagaId, status: 'in_progress', message: 'Event processed' };
}

async function archiveEvents(config) {
  const { aggregateType, beforeDate, archivePath } = config;

  // Get events to archive
  const events = await connectionPool.executeWithMySQLConnection(async (connection) => {
    const [rows] = await connection.execute(
      'SELECT * FROM events WHERE aggregate_type = ? AND timestamp < ?',
      [aggregateType, beforeDate]
    );
    return rows;
  });

  if (events.length === 0) {
    return { archived: 0, message: 'No events to archive' };
  }

  // In a real implementation, you'd write to archive storage
  // For now, we'll just mark them as archived
  await connectionPool.executeWithMySQLConnection(async (connection) => {
    await connection.execute(
      'UPDATE events SET archived = 1 WHERE aggregate_type = ? AND timestamp < ?',
      [aggregateType, beforeDate]
    );
  });

  return {
    archived: events.length,
    aggregateType,
    beforeDate,
    archivePath
  };
}

async function getEventStatistics(criteria) {
  const { aggregateType, startDate, endDate } = criteria;

  let sql = `
    SELECT
      COUNT(*) as totalEvents,
      COUNT(DISTINCT aggregate_id) as uniqueAggregates,
      COUNT(DISTINCT event_type) as uniqueEventTypes,
      MIN(timestamp) as firstEvent,
      MAX(timestamp) as lastEvent
    FROM events
    WHERE 1=1
  `;
  const params = [];

  if (aggregateType) {
    sql += ' AND aggregate_type = ?';
    params.push(aggregateType);
  }

  if (startDate) {
    sql += ' AND timestamp >= ?';
    params.push(startDate);
  }

  if (endDate) {
    sql += ' AND timestamp <= ?';
    params.push(endDate);
  }

  const stats = await connectionPool.executeWithMySQLConnection(async (connection) => {
    const [rows] = await connection.execute(sql, params);
    return rows[0];
  });

  // Get event type breakdown
  const eventTypeSql = `
    SELECT event_type, COUNT(*) as count
    FROM events
    WHERE 1=1
  `;
  const eventTypeParams = [...params];

  if (aggregateType) {
    eventTypeSql += ' AND aggregate_type = ?';
  }

  if (startDate) {
    eventTypeSql += ' AND timestamp >= ?';
  }

  if (endDate) {
    eventTypeSql += ' AND timestamp <= ?';
  }

  eventTypeSql += ' GROUP BY event_type ORDER BY count DESC';

  const eventTypes = await connectionPool.executeWithMySQLConnection(async (connection) => {
    const [rows] = await connection.execute(eventTypeSql, eventTypeParams);
    return rows;
  });

  return {
    ...stats,
    eventTypeBreakdown: eventTypes
  };
}

async function validateEvent(event) {
  const errors = [];

  if (!event.aggregateId) errors.push('aggregateId is required');
  if (!event.aggregateType) errors.push('aggregateType is required');
  if (!event.eventType) errors.push('eventType is required');
  if (!event.version || event.version < 1) errors.push('valid version is required');
  if (!event.data) errors.push('data is required');

  // Check version uniqueness
  if (event.aggregateId && event.version) {
    const existing = await connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT id FROM events WHERE aggregate_id = ? AND version = ?',
        [event.aggregateId, event.version]
      );
      return rows;
    });

    if (existing.length > 0) {
      errors.push('Event version already exists for this aggregate');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

async function getCorrelatedEvents(correlationId) {
  const events = await connectionPool.executeWithMySQLConnection(async (connection) => {
    const [rows] = await connection.execute(
      'SELECT * FROM events WHERE correlation_id = ? ORDER BY timestamp ASC',
      [correlationId]
    );
    return rows;
  });

  return events.map(event => ({
    ...event,
    data: JSON.parse(event.data),
    metadata: JSON.parse(event.metadata || '{}')
  }));
}

async function transformEvents(events, transformation) {
  // Simple transformation - in real implementation, this would be more sophisticated
  return events.map(event => {
    const transformed = { ...event };

    if (transformation.maskSensitiveData) {
      if (transformed.data.amount) {
        transformed.data.amount = '***masked***';
      }
      if (transformed.data.accountNumber) {
        transformed.data.accountNumber = transformed.data.accountNumber.substring(0, 4) + '****';
      }
    }

    if (transformation.addMetadata) {
      transformed.metadata = {
        ...transformed.metadata,
        transformed: true,
        transformationType: transformation.type
      };
    }

    return transformed;
  });
}

// Initialize service
async function initializeService() {
  try {
    await connectionPool.initialize();
    await kafkaService.initialize();

    logger.info(`Event Store Service started on port ${PORT}`);
  } catch (error) {
    logger.error('Failed to initialize Event Store Service:', error);
    process.exit(1);
  }
}

app.listen(PORT, () => {
  initializeService();
});

export default app;