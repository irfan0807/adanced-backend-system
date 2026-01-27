import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import DatabaseConnectionPool from '../../shared/database/connection-pool.js';
import DualDatabaseWriter from '../../shared/database/dual-writer.js';
import { KafkaService } from '../../shared/messaging/kafka-service.js';
import EventStore from '../../shared/event-sourcing/event-store.js';
import CommandBus from '../../shared/cqrs/command-bus.js';
import QueryBus from '../../shared/cqrs/query-bus.js';
import { SettlementService } from './settlement-service.js';
import winston from 'winston';

const app = express();
const PORT = process.env.SETTLEMENT_SERVICE_PORT || 3010;

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/settlement-service.log' })
  ]
});

// Initialize dependencies
const connectionPool = new DatabaseConnectionPool();
const kafkaService = new KafkaService();
const dualWriter = new DualDatabaseWriter(connectionPool);
const eventStore = new EventStore(connectionPool, kafkaService);
const commandBus = new CommandBus();
const queryBus = new QueryBus();

// Initialize Settlement Service
const settlementService = new SettlementService({
  connectionPool,
  dualWriter,
  eventStore,
  kafkaService,
  commandBus,
  queryBus,
  logger
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    body: req.method !== 'GET' ? req.body : undefined
  });
  next();
});

// Settlement Routes
app.post('/settlements', async (req, res) => {
  try {
    const {
      merchantId,
      period,
      transactionIds,
      settlementMethod,
      metadata,
      createdBy
    } = req.body;

    if (!merchantId) {
      return res.status(400).json({
        success: false,
        error: 'Merchant ID is required',
        timestamp: new Date().toISOString()
      });
    }

    const result = await settlementService.createSettlement({
      merchantId,
      period,
      transactionIds,
      settlementMethod,
      metadata,
      createdBy: createdBy || 'api'
    });

    res.status(201).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error creating settlement:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/settlements/:id', async (req, res) => {
  try {
    const { includeDetails = 'true' } = req.query;

    const result = await settlementService.getSettlement(
      req.params.id,
      includeDetails === 'true'
    );

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Settlement not found',
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting settlement:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/settlements', async (req, res) => {
  try {
    const {
      merchantId,
      status,
      startDate,
      endDate,
      minAmount,
      maxAmount,
      currency,
      settlementMethod,
      page = 1,
      limit = 50,
      includeDetails = 'false'
    } = req.query;

    const filters = {
      merchantId,
      status,
      startDate,
      endDate,
      minAmount: minAmount ? parseFloat(minAmount) : undefined,
      maxAmount: maxAmount ? parseFloat(maxAmount) : undefined,
      currency,
      settlementMethod,
      includeDetails: includeDetails === 'true'
    };

    const pagination = {
      page: parseInt(page),
      limit: parseInt(limit)
    };

    const result = await settlementService.getSettlements(filters, pagination);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting settlements:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/settlements/merchant/:merchantId', async (req, res) => {
  try {
    const {
      status,
      startDate,
      endDate,
      minAmount,
      maxAmount,
      page = 1,
      limit = 50,
      includeTransactions = 'false'
    } = req.query;

    const filters = {
      status,
      startDate,
      endDate,
      minAmount: minAmount ? parseFloat(minAmount) : undefined,
      maxAmount: maxAmount ? parseFloat(maxAmount) : undefined,
      includeTransactions: includeTransactions === 'true'
    };

    const pagination = {
      page: parseInt(page),
      limit: parseInt(limit)
    };

    const result = await settlementService.getMerchantSettlements(
      req.params.merchantId,
      filters,
      pagination
    );

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting merchant settlements:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.put('/settlements/:id/process', async (req, res) => {
  try {
    const { processedBy, processingNotes, metadata } = req.body;

    const result = await settlementService.processSettlement(req.params.id, {
      processedBy: processedBy || 'api',
      processingNotes,
      metadata
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error processing settlement:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.put('/settlements/:id/complete', async (req, res) => {
  try {
    const {
      referenceNumber,
      transferDetails,
      completedBy,
      completionNotes,
      metadata
    } = req.body;

    const result = await settlementService.completeSettlement(req.params.id, {
      referenceNumber,
      transferDetails,
      completedBy: completedBy || 'api',
      completionNotes,
      metadata
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error completing settlement:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.put('/settlements/:id/cancel', async (req, res) => {
  try {
    const { reason, cancelledBy, cancellationNotes, metadata } = req.body;

    const result = await settlementService.cancelSettlement(req.params.id, {
      reason,
      cancelledBy: cancelledBy || 'api',
      cancellationNotes,
      metadata
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error cancelling settlement:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Settlement Schedule Routes
app.get('/settlements/schedule/:merchantId', async (req, res) => {
  try {
    const result = await settlementService.getSettlementSchedule(req.params.merchantId);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting settlement schedule:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.put('/settlements/schedule/:merchantId', async (req, res) => {
  try {
    const {
      scheduleType,
      scheduleConfig,
      minimumAmount,
      maximumAmount,
      isActive,
      updatedBy
    } = req.body;

    const result = await settlementService.updateSettlementSchedule({
      merchantId: req.params.merchantId,
      scheduleType,
      scheduleConfig,
      minimumAmount,
      maximumAmount,
      isActive,
      updatedBy: updatedBy || 'api'
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error updating settlement schedule:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Bulk Settlement Routes
app.post('/settlements/bulk', async (req, res) => {
  try {
    const { merchantIds, period, forceProcess, processedBy, metadata } = req.body;

    const result = await settlementService.processBulkSettlement({
      merchantIds,
      period,
      forceProcess,
      processedBy: processedBy || 'api',
      metadata
    });

    res.status(201).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error processing bulk settlement:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/settlements/scheduled/process', async (req, res) => {
  try {
    const result = await settlementService.processScheduledSettlements();

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error processing scheduled settlements:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Settlement Adjustments Routes
app.post('/settlements/:id/adjustments', async (req, res) => {
  try {
    const {
      adjustmentType,
      adjustmentAmount,
      reason,
      referenceId,
      adjustedBy,
      metadata
    } = req.body;

    const result = await settlementService.adjustSettlement(req.params.id, {
      adjustmentType,
      adjustmentAmount,
      reason,
      referenceId,
      adjustedBy: adjustedBy || 'api',
      metadata
    });

    res.status(201).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error adjusting settlement:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/settlements/:id/adjustments', async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;

    const result = await settlementService.getSettlementAdjustments(req.params.id, {
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting settlement adjustments:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Settlement Holds Routes
app.post('/settlements/:id/holds', async (req, res) => {
  try {
    const {
      holdType,
      holdReason,
      holdAmount,
      releaseDate,
      placedBy,
      metadata
    } = req.body;

    const result = await settlementService.createSettlementHold(req.params.id, {
      holdType,
      holdReason,
      holdAmount,
      releaseDate,
      placedBy: placedBy || 'api',
      metadata
    });

    res.status(201).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error creating settlement hold:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.put('/settlements/:settlementId/holds/:holdId/release', async (req, res) => {
  try {
    const { releaseReason, releasedBy, metadata } = req.body;

    const result = await settlementService.releaseSettlementHold(
      req.params.settlementId,
      req.params.holdId,
      {
        releaseReason,
        releasedBy: releasedBy || 'api',
        metadata
      }
    );

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error releasing settlement hold:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/settlements/holds', async (req, res) => {
  try {
    const {
      settlementId,
      merchantId,
      holdType,
      status,
      startDate,
      endDate,
      page = 1,
      limit = 50
    } = req.query;

    const filters = {
      settlementId,
      merchantId,
      holdType,
      status,
      startDate,
      endDate
    };

    const pagination = {
      page: parseInt(page),
      limit: parseInt(limit)
    };

    const result = await settlementService.getSettlementHolds(filters, pagination);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting settlement holds:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Analytics and Reporting Routes
app.get('/settlements/analytics/:analyticsType', async (req, res) => {
  try {
    const { merchantId, startDate, endDate, groupBy } = req.query;

    const result = await settlementService.getSettlementAnalytics(req.params.analyticsType, {
      merchantId,
      startDate,
      endDate,
      groupBy
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting settlement analytics:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/settlements/metrics/:metricType', async (req, res) => {
  try {
    const { merchantId, startDate, endDate, groupBy } = req.query;

    const result = await settlementService.getSettlementMetrics(req.params.metricType, {
      merchantId,
      startDate,
      endDate,
      groupBy
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting settlement metrics:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/settlements/dashboard', async (req, res) => {
  try {
    const {
      merchantId,
      timeRange,
      includePending,
      includeCompleted,
      includeFailed
    } = req.query;

    const result = await settlementService.getSettlementDashboard({
      merchantId,
      timeRange,
      includePending: includePending === 'true',
      includeCompleted: includeCompleted === 'true',
      includeFailed: includeFailed === 'true'
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting settlement dashboard:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/settlements/reports', async (req, res) => {
  try {
    const { reportType, merchantId, startDate, endDate, format, generatedBy } = req.body;

    const result = await settlementService.getSettlementReport(reportType, {
      merchantId,
      startDate,
      endDate,
      format,
      generatedBy: generatedBy || 'api'
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error generating settlement report:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Reconciliation Routes
app.get('/settlements/reconciliation', async (req, res) => {
  try {
    const { startDate, endDate, merchantId, includeDiscrepancies } = req.query;

    const result = await settlementService.getSettlementReconciliation({
      startDate,
      endDate,
      merchantId,
      includeDiscrepancies: includeDiscrepancies === 'true'
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting settlement reconciliation:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/settlements/reconcile', async (req, res) => {
  try {
    const { startDate, endDate, merchantId } = req.body;

    const result = await settlementService.reconcileSettlements(startDate, endDate, merchantId);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error reconciling settlements:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Eligibility Check Route
app.post('/settlements/eligibility/check', async (req, res) => {
  try {
    const { merchantId, period } = req.body;

    const result = await settlementService.checkSettlementEligibility(merchantId, period);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error checking settlement eligibility:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Calculate Amounts Route
app.post('/settlements/amounts/calculate', async (req, res) => {
  try {
    const { merchantId, startDate, endDate, transactionIds } = req.body;

    const result = await settlementService.calculateSettlementAmounts(
      merchantId,
      startDate,
      endDate,
      transactionIds
    );

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error calculating settlement amounts:', error);
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
    service: 'settlement-service',
    timestamp: new Date().toISOString(),
    dependencies: {
      database: connectionPool.getStats(),
      dualWriter: dualWriter.getStats(),
      kafka: kafkaService.getStats(),
      eventStore: eventStore.getStats(),
      settlementService: settlementService.getHealthStatus()
    }
  });
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
  res.json({
    service: 'settlement-service',
    timestamp: new Date().toISOString(),
    database: connectionPool.getStats(),
    dualWriter: dualWriter.getStats(),
    kafka: kafkaService.getStats(),
    eventStore: eventStore.getStats(),
    cqrs: {
      commandsProcessed: commandBus.getProcessedCount(),
      queriesProcessed: queryBus.getProcessedCount()
    },
    settlementService: settlementService.getHealthStatus()
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    timestamp: new Date().toISOString()
  });
});

// Initialize service
async function initializeService() {
  try {
    await connectionPool.initialize();
    await kafkaService.initialize();
    await settlementService.initialize();

    logger.info(`Settlement Service started on port ${PORT}`);
  } catch (error) {
    logger.error('Failed to initialize Settlement Service:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await connectionPool.close();
  await kafkaService.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await connectionPool.close();
  await kafkaService.close();
  process.exit(0);
});

app.listen(PORT, () => {
  initializeService();
});

export default app;