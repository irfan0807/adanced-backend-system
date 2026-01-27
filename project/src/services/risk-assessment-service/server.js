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
import { RiskAssessmentService } from './risk-assessment-service.js';
import winston from 'winston';

const app = express();
const PORT = process.env.RISK_ASSESSMENT_SERVICE_PORT || 3008;

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/risk-assessment-service.log' })
  ]
});

// Initialize dependencies
const connectionPool = new DatabaseConnectionPool();
const kafkaService = new KafkaService();
const dualWriter = new DualDatabaseWriter(connectionPool);
const eventStore = new EventStore(connectionPool, kafkaService);
const commandBus = new CommandBus();
const queryBus = new QueryBus();

// Initialize Risk Assessment Service
const riskService = new RiskAssessmentService({
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

// Risk Assessment Routes
app.post('/risk-assessment/transactions', async (req, res) => {
  try {
    const {
      transactionId,
      amount,
      userId,
      merchantId,
      location,
      deviceInfo,
      paymentMethod,
      transactionType
    } = req.body;

    if (!transactionId || !amount || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Transaction ID, amount, and user ID are required',
        timestamp: new Date().toISOString()
      });
    }

    const result = await riskService.assessTransactionRisk({
      transactionId,
      amount,
      userId,
      merchantId,
      location,
      deviceInfo,
      paymentMethod,
      transactionType
    });

    res.status(201).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error assessing transaction risk:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/risk-assessment/users', async (req, res) => {
  try {
    const { userId, transactionHistory, userProfile, behavioralData } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required',
        timestamp: new Date().toISOString()
      });
    }

    const result = await riskService.assessUserRisk(userId, {
      transactionHistory,
      userProfile,
      behavioralData
    });

    res.status(201).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error assessing user risk:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/risk-assessment/merchants', async (req, res) => {
  try {
    const { merchantId, transactionVolume, chargebackRate, businessProfile } = req.body;

    if (!merchantId) {
      return res.status(400).json({
        success: false,
        error: 'Merchant ID is required',
        timestamp: new Date().toISOString()
      });
    }

    const result = await riskService.assessMerchantRisk(merchantId, {
      transactionVolume,
      chargebackRate,
      businessProfile
    });

    res.status(201).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error assessing merchant risk:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get Risk Assessment Routes
app.get('/risk-assessments/:id', async (req, res) => {
  try {
    const { includeDetails = 'true' } = req.query;

    const result = await riskService.getRiskAssessment(
      req.params.id,
      includeDetails === 'true'
    );

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Risk assessment not found',
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting risk assessment:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/risk-assessments', async (req, res) => {
  try {
    const {
      riskLevel,
      userId,
      merchantId,
      startDate,
      endDate,
      minScore,
      maxScore,
      limit = 50,
      offset = 0,
      includeDetails = 'false'
    } = req.query;

    const filters = {
      riskLevel,
      userId,
      merchantId,
      startDate,
      endDate,
      minScore: minScore ? parseInt(minScore) : undefined,
      maxScore: maxScore ? parseInt(maxScore) : undefined
    };

    const result = await riskService.getRiskAssessments(filters, {
      limit: parseInt(limit),
      offset: parseInt(offset),
      includeDetails: includeDetails === 'true'
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting risk assessments:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// User Risk Profile Routes
app.get('/risk-profiles/users/:userId', async (req, res) => {
  try {
    const { includeHistory = 'true', timeRange = '30d' } = req.query;

    const result = await riskService.getUserRiskProfile(req.params.userId, {
      includeHistory: includeHistory === 'true',
      timeRange
    });

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'User risk profile not found',
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting user risk profile:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Merchant Risk Profile Routes
app.get('/risk-profiles/merchants/:merchantId', async (req, res) => {
  try {
    const { includeHistory = 'true', timeRange = '30d' } = req.query;

    const result = await riskService.getMerchantRiskProfile(req.params.merchantId, {
      includeHistory: includeHistory === 'true',
      timeRange
    });

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Merchant risk profile not found',
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting merchant risk profile:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Risk Rules Routes
app.post('/risk-rules', async (req, res) => {
  try {
    const {
      name,
      description,
      ruleType,
      conditions,
      actions,
      priority,
      isActive,
      createdBy
    } = req.body;

    const result = await riskService.createRiskRule({
      name,
      description,
      ruleType,
      conditions,
      actions,
      priority,
      isActive,
      createdBy
    });

    res.status(201).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error creating risk rule:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/risk-rules', async (req, res) => {
  try {
    const {
      ruleType,
      isActive,
      createdBy,
      limit = 100,
      offset = 0
    } = req.query;

    const filters = {
      ruleType,
      isActive: isActive === 'true',
      createdBy
    };

    const result = await riskService.getRiskRules(filters, {
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting risk rules:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/risk-rules/:id', async (req, res) => {
  try {
    const result = await riskService.getRiskRules({ id: req.params.id });

    if (!result || result.rules.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Risk rule not found',
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: result.rules[0],
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting risk rule:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Risk Metrics Routes
app.get('/risk-metrics/:metricType', async (req, res) => {
  try {
    const { timeRange = '24h', groupBy = 'hour' } = req.query;

    const result = await riskService.getRiskMetrics(req.params.metricType, timeRange, {
      groupBy
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting risk metrics:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Risk Alerts Routes
app.get('/risk-alerts', async (req, res) => {
  try {
    const {
      severity,
      status = 'active',
      alertType,
      startDate,
      endDate,
      limit = 50,
      offset = 0
    } = req.query;

    const filters = {
      alertType,
      startDate,
      endDate
    };

    const result = await riskService.getRiskAlerts(filters, {
      severity,
      status,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting risk alerts:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Fraud Patterns Routes
app.get('/fraud-patterns', async (req, res) => {
  try {
    const {
      patternType,
      confidence,
      timeRange = '7d',
      limit = 50,
      offset = 0
    } = req.query;

    const result = await riskService.getRiskAlerts(
      { patternType, confidence, timeRange },
      { limit: parseInt(limit), offset: parseInt(offset) }
    );

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting fraud patterns:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Risk Thresholds Routes
app.get('/risk-thresholds', async (req, res) => {
  try {
    const { thresholdType, currency, activeOnly = 'true' } = req.query;

    const result = await riskService.getRiskThresholds({
      thresholdType,
      currency,
      activeOnly: activeOnly === 'true'
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting risk thresholds:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.put('/risk-thresholds', async (req, res) => {
  try {
    const { thresholdType, value, currency, timeWindow, updatedBy } = req.body;

    // This would need to be implemented in the service
    res.status(501).json({
      success: false,
      error: 'Update risk thresholds not yet implemented',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error updating risk thresholds:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Risk Dashboard Route
app.get('/risk-dashboard', async (req, res) => {
  try {
    const {
      timeRange = '24h',
      includeAlerts = 'true',
      includeMetrics = 'true',
      includeTopRisks = 'true'
    } = req.query;

    const result = await riskService.getRiskDashboard(timeRange, {
      includeAlerts: includeAlerts === 'true',
      includeMetrics: includeMetrics === 'true',
      includeTopRisks: includeTopRisks === 'true'
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting risk dashboard:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Risk Reports Routes
app.post('/risk-reports', async (req, res) => {
  try {
    const { reportType, parameters, generatedBy } = req.body;

    const result = await riskService.generateRiskReport(reportType, {
      ...parameters,
      generatedBy
    });

    res.status(201).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error generating risk report:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/risk-reports', async (req, res) => {
  try {
    const {
      reportType,
      generatedBy,
      startDate,
      endDate,
      limit = 50,
      offset = 0,
      includeData = 'false'
    } = req.query;

    const filters = {
      reportType,
      generatedBy,
      startDate,
      endDate
    };

    const result = await riskService.getRiskReports(filters, {
      limit: parseInt(limit),
      offset: parseInt(offset),
      includeData: includeData === 'true'
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting risk reports:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/risk-reports/:id', async (req, res) => {
  try {
    const { includeData = 'true' } = req.query;

    const result = await riskService.getRiskReports(
      { id: req.params.id },
      { includeData: includeData === 'true' }
    );

    if (!result || result.reports.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Risk report not found',
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: result.reports[0],
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting risk report:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Risk Analytics Routes
app.get('/risk-analytics/:analyticsType', async (req, res) => {
  try {
    const {
      timeRange = '30d',
      groupBy = 'day',
      includeTrends = 'true'
    } = req.query;

    const result = await riskService.getRiskAnalytics(req.params.analyticsType, {
      timeRange,
      groupBy,
      includeTrends: includeTrends === 'true'
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting risk analytics:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Review and Action Routes
app.post('/risk-assessments/:id/review', async (req, res) => {
  try {
    const { reviewDecision, reviewNotes, reviewedBy } = req.body;

    const result = await riskService.reviewRiskAssessment(req.params.id, {
      reviewDecision,
      reviewNotes,
      reviewedBy
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error reviewing risk assessment:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/risk-assessments/:id/actions', async (req, res) => {
  try {
    const { actionType, parameters, executedBy } = req.body;

    const result = await riskService.executeRiskAction(req.params.id, actionType, {
      ...parameters,
      executedBy
    });

    res.status(201).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error executing risk action:', error);
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
    service: 'risk-assessment-service',
    timestamp: new Date().toISOString(),
    dependencies: {
      database: connectionPool.getStats(),
      dualWriter: dualWriter.getStats(),
      kafka: kafkaService.getStats(),
      eventStore: eventStore.getStats(),
      riskService: riskService.getHealthStatus()
    }
  });
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
  res.json({
    service: 'risk-assessment-service',
    timestamp: new Date().toISOString(),
    database: connectionPool.getStats(),
    dualWriter: dualWriter.getStats(),
    kafka: kafkaService.getStats(),
    eventStore: eventStore.getStats(),
    cqrs: {
      commandsProcessed: commandBus.getProcessedCount(),
      queriesProcessed: queryBus.getProcessedCount()
    },
    riskService: riskService.getHealthStatus()
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
    await riskService.initialize();

    logger.info(`Risk Assessment Service started on port ${PORT}`);
  } catch (error) {
    logger.error('Failed to initialize Risk Assessment Service:', error);
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