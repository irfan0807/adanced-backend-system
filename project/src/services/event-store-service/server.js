import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { v4 as uuidv4 } from 'uuid';
import DatabaseConnectionPool from '../../shared/database/connection-pool.js';
import DualDatabaseWriter from '../../shared/database/dual-writer.js';
import { KafkaService } from '../../shared/messaging/kafka-service.js';
import winston from 'winston';
import { EventStoreService } from './event-store-service.js';

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

// Initialize Event Store Service
const eventStoreService = new EventStoreService({
  connectionPool,
  kafkaService,
  dualWriter,
  logger
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));

// Routes
app.post('/events', async (req, res) => {
  try {
    const { aggregateId, aggregateType, eventType, eventData, metadata } = req.body;

    const result = await eventStoreService.storeEvent(aggregateId, aggregateType, eventType, eventData, metadata);

    res.status(201).json({
      success: true,
      data: result.data,
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

    const result = await eventStoreService.getEventsForAggregate(
      req.params.aggregateId,
      fromVersion ? parseInt(fromVersion) : null,
      toVersion ? parseInt(toVersion) : null
    );

    res.json({
      success: true,
      data: result.data,
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

    const result = await eventStoreService.getEvents({
      aggregateType,
      eventType,
      startDate,
      endDate,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
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

    const result = await eventStoreService.replayEvents(req.params.aggregateId, fromVersion, toVersion);

    res.json({
      success: true,
      data: result.data,
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
    const result = await eventStoreService.getSnapshot(req.params.aggregateId);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: result.error,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: result.data,
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

    const result = await eventStoreService.createSnapshot(req.params.aggregateId, state, version);

    res.status(201).json({
      success: true,
      data: result.data,
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
    const result = await eventStoreService.rebuildAggregateState(req.params.aggregateId);

    res.json({
      success: true,
      data: result.data,
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

app.get('/events/stream/:aggregateId', async (req, res) => {
  try {
    const { fromVersion = 1 } = req.query;

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const result = await eventStoreService.getEventsForAggregate(req.params.aggregateId, parseInt(fromVersion));
    const events = result.data;

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

    const result = await eventStoreService.storeEventsBatch(events);

    res.status(201).json({
      success: true,
      data: result.data,
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

    const result = await eventStoreService.searchEvents({
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
      data: result.data,
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

    const result = await eventStoreService.createProjection(req.params.name, aggregateType, eventTypes, initialState);

    res.status(201).json({
      success: true,
      data: result.data,
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
    const result = await eventStoreService.getProjection(req.params.name);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: result.error,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: result.data,
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

    const result = await eventStoreService.updateProjection(req.params.name, rebuild);

    res.json({
      success: true,
      data: result.data,
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

    const result = await eventStoreService.createSaga(sagaType, initiatingEvent, steps);

    res.status(201).json({
      success: true,
      data: result.data,
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
    const result = await eventStoreService.getSaga(req.params.sagaId);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: result.error,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: result.data,
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

    const result = await eventStoreService.processSagaEvent(req.params.sagaId, eventType, eventData);

    res.json({
      success: true,
      data: result.data,
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

    const result = await eventStoreService.archiveEvents(aggregateType, beforeDate, archivePath);

    res.json({
      success: true,
      data: result.data,
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

    const result = await eventStoreService.getEventStatistics({
      aggregateType,
      startDate,
      endDate
    });

    res.json({
      success: true,
      data: result.data,
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

    const result = await eventStoreService.validateEvent(event);

    res.json({
      success: true,
      data: result.data,
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
    const result = await eventStoreService.getCorrelatedEvents(req.params.correlationId);

    res.json({
      success: true,
      data: result.data,
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

    const result = await eventStoreService.transformEvents(events, transformation);

    res.json({
      success: true,
      data: result.data,
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

// Advanced event store endpoints
app.get('/alerts', async (req, res) => {
  try {
    const { severity, startDate, endDate, page = 1, limit = 20 } = req.query;

    const result = await eventStoreService.getEventStoreAlerts({
      severity,
      startDate,
      endDate,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting alerts:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/backups', async (req, res) => {
  try {
    const { backupType, startDate, endDate, page = 1, limit = 20 } = req.query;

    const result = await eventStoreService.getEventStoreBackups({
      backupType,
      startDate,
      endDate,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting backups:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/reports', async (req, res) => {
  try {
    const { reportType, startDate, endDate, page = 1, limit = 20 } = req.query;

    const result = await eventStoreService.getEventStoreReports({
      reportType,
      startDate,
      endDate,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting reports:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/settings', async (req, res) => {
  try {
    const result = await eventStoreService.getEventStoreSettings();

    res.json({
      success: true,
      data: result.data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting settings:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/audit-log', async (req, res) => {
  try {
    const { action, userId, startDate, endDate, page = 1, limit = 20 } = req.query;

    const result = await eventStoreService.getEventStoreAuditLog({
      action,
      userId,
      startDate,
      endDate,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting audit log:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/performance-metrics', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const result = await eventStoreService.getEventStorePerformanceMetrics({
      startDate,
      endDate
    });

    res.json({
      success: true,
      data: result.data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting performance metrics:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/storage-metrics', async (req, res) => {
  try {
    const result = await eventStoreService.getEventStoreStorageMetrics();

    res.json({
      success: true,
      data: result.data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting storage metrics:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Health check
app.get('/health', async (req, res) => {
  try {
    const health = await eventStoreService.healthCheck();
    res.json(health);
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    const result = await eventStoreService.getEventStoreMetrics();
    res.json(result.data);
  } catch (error) {
    res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Initialize service
async function initializeService() {
  try {
    await eventStoreService.initialize();

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