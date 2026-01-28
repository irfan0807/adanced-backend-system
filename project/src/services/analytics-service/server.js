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
import { AnalyticsService } from './analytics-service.js';
import winston from 'winston';

const app = express();
const PORT = process.env.ANALYTICS_SERVICE_PORT || 3007;

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/analytics-service.log' })
  ]
});

// Initialize dependencies
const connectionPool = new DatabaseConnectionPool();
const kafkaService = new KafkaService();
const dualWriter = new DualDatabaseWriter(connectionPool);
const eventStore = new EventStore(connectionPool, kafkaService);
const commandBus = new CommandBus();
const queryBus = new QueryBus();

// Initialize Analytics Service
const analyticsService = new AnalyticsService({
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

// Routes

// Analytics Query Routes
app.get('/analytics/transactions/summary', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      groupBy = 'day',
      metrics,
      page = 1,
      limit = 100,
      includeRealtime = false
    } = req.query;

    const filters = {};
    if (req.query.accountId) filters.accountId = req.query.accountId;
    if (req.query.currency) filters.currency = req.query.currency;

    const result = await analyticsService.getTransactionAnalytics({
      startDate,
      endDate,
      groupBy,
      filters,
      metrics: metrics ? metrics.split(',') : undefined,
      page: parseInt(page),
      limit: parseInt(limit),
      includeRealtime: includeRealtime === 'true'
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting transaction analytics:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/analytics/users/activity', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      metric = 'transactions',
      groupBy = 'day',
      segmentBy = 'all',
      page = 1,
      limit = 100,
      includeTrends = false
    } = req.query;

    const filters = {};
    if (req.query.userId) filters.userId = req.query.userId;

    const result = await analyticsService.getUserActivityAnalytics({
      startDate,
      endDate,
      metric,
      groupBy,
      filters,
      segmentBy,
      page: parseInt(page),
      limit: parseInt(limit),
      includeTrends: includeTrends === 'true'
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting user activity analytics:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/analytics/payments/methods', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      groupBy = 'method',
      page = 1,
      limit = 50,
      includeTrends = false,
      includeComparison = false
    } = req.query;

    const filters = {};
    if (req.query.currency) filters.currency = req.query.currency;

    const result = await analyticsService.getPaymentMethodsAnalytics({
      startDate,
      endDate,
      groupBy,
      filters,
      includeTrends: includeTrends === 'true',
      includeComparison: includeComparison === 'true',
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting payment methods analytics:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/analytics/revenue', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      groupBy = 'month',
      page = 1,
      limit = 100,
      includeFees = true,
      includeRefunds = false,
      currency
    } = req.query;

    const filters = {};
    if (req.query.paymentMethod) filters.paymentMethod = req.query.paymentMethod;

    const result = await analyticsService.getRevenueAnalytics({
      startDate,
      endDate,
      groupBy,
      filters,
      includeFees: includeFees === 'true',
      includeRefunds: includeRefunds === 'true',
      currency,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting revenue analytics:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/analytics/accounts/summary', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      metrics,
      groupBy = 'month',
      page = 1,
      limit = 100,
      includeGeographic = false
    } = req.query;

    const filters = {};
    if (req.query.accountType) filters.accountType = req.query.accountType;
    if (req.query.currency) filters.currency = req.query.currency;

    const result = await analyticsService.getAccountAnalytics({
      startDate,
      endDate,
      metrics: metrics ? metrics.split(',') : undefined,
      groupBy,
      filters,
      includeGeographic: includeGeographic === 'true',
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting account analytics:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Report Generation Routes
app.post('/analytics/reports/generate', async (req, res) => {
  try {
    const {
      reportId,
      reportType,
      parameters = {},
      filters = {},
      generatedBy
    } = req.body;

    if (!reportType || !generatedBy) {
      return res.status(400).json({
        success: false,
        error: 'reportType and generatedBy are required',
        timestamp: new Date().toISOString()
      });
    }

    const result = await analyticsService.generateAnalyticsReport({
      reportId,
      reportType,
      parameters,
      filters,
      generatedBy
    });

    res.status(201).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error generating analytics report:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/analytics/reports/:reportId', async (req, res) => {
  try {
    const { includeData = true, format = 'json' } = req.query;

    const report = await analyticsService.getAnalyticsReport(
      req.params.reportId,
      { includeData: includeData === 'true', format }
    );

    res.json({
      success: true,
      data: report,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting analytics report:', error);
    if (error.message === 'Report not found') {
      res.status(404).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
});

// Dashboard Routes
app.post('/analytics/dashboards', async (req, res) => {
  try {
    const {
      dashboardId,
      name,
      description,
      widgets = [],
      filters = {},
      refreshInterval = 300,
      createdBy
    } = req.body;

    if (!name || !createdBy) {
      return res.status(400).json({
        success: false,
        error: 'name and createdBy are required',
        timestamp: new Date().toISOString()
      });
    }

    const result = await analyticsService.createAnalyticsDashboard({
      dashboardId,
      name,
      description,
      widgets,
      filters,
      refreshInterval,
      createdBy
    });

    res.status(201).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error creating analytics dashboard:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/analytics/dashboards/:dashboardId', async (req, res) => {
  try {
    const { includeData = true, refreshData = false } = req.query;

    const dashboard = await analyticsService.getAnalyticsDashboard(
      req.params.dashboardId,
      {
        includeData: includeData === 'true',
        refreshData: refreshData === 'true'
      }
    );

    res.json({
      success: true,
      data: dashboard,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting analytics dashboard:', error);
    if (error.message === 'Dashboard not found') {
      res.status(404).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
});

app.get('/analytics/dashboards', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = 'desc',
      createdBy,
      name
    } = req.query;

    const filters = {};
    if (createdBy) filters.createdBy = createdBy;
    if (name) filters.name = name;

    const result = await analyticsService.getAnalyticsDashboards({
      filters,
      page: parseInt(page),
      limit: parseInt(limit),
      sortBy,
      sortOrder
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting analytics dashboards:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.put('/analytics/dashboards/:dashboardId', async (req, res) => {
  try {
    const { updates, updatedBy } = req.body;

    if (!updates || !updatedBy) {
      return res.status(400).json({
        success: false,
        error: 'updates and updatedBy are required',
        timestamp: new Date().toISOString()
      });
    }

    const result = await analyticsService.updateAnalyticsDashboard(
      req.params.dashboardId,
      { updates, updatedBy }
    );

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error updating analytics dashboard:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Export Routes
app.post('/analytics/export', async (req, res) => {
  try {
    const {
      exportId,
      reportType,
      format = 'json',
      filters = {},
      includeCharts = false,
      exportedBy
    } = req.body;

    if (!reportType || !exportedBy) {
      return res.status(400).json({
        success: false,
        error: 'reportType and exportedBy are required',
        timestamp: new Date().toISOString()
      });
    }

    const result = await analyticsService.exportAnalyticsData({
      exportId,
      reportType,
      format,
      filters,
      includeCharts,
      exportedBy
    });

    res.status(201).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error exporting analytics data:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Cache Management Routes
app.post('/analytics/cache/refresh', async (req, res) => {
  try {
    const {
      cacheType = 'all',
      forceRefresh = false,
      refreshedBy
    } = req.body;

    if (!refreshedBy) {
      return res.status(400).json({
        success: false,
        error: 'refreshedBy is required',
        timestamp: new Date().toISOString()
      });
    }

    const result = await analyticsService.refreshAnalyticsCache({
      cacheType,
      forceRefresh,
      refreshedBy
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error refreshing analytics cache:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Metrics Routes
app.get('/analytics/metrics', async (req, res) => {
  try {
    const {
      metricType = 'kpi',
      timeRange = '30d',
      realTime = false
    } = req.query;

    const filters = {};
    if (req.query.userId) filters.userId = req.query.userId;

    const result = await analyticsService.getAnalyticsMetrics({
      metricType,
      timeRange,
      filters,
      realTime: realTime === 'true'
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting analytics metrics:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/analytics/summary/:userId', async (req, res) => {
  try {
    const summary = await analyticsService.getAnalyticsSummary(req.params.userId);
    res.json({
      success: true,
      data: summary,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting analytics summary:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Health and Management Routes
app.get('/health', async (req, res) => {
  try {
    const health = await analyticsService.getAnalyticsHealthStatus();
    res.json(health);
  } catch (error) {
    logger.error('Error getting health status:', error);
    res.status(500).json({
      status: 'unhealthy',
      service: 'analytics-service',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/metrics', (req, res) => {
  res.json({
    service: 'analytics-service',
    timestamp: new Date().toISOString(),
    database: connectionPool.getStats(),
    dualWriter: dualWriter.getStats(),
    cache: {
      size: analyticsService.cache?.size || 0
    }
  });
});

app.post('/analytics/cleanup', async (req, res) => {
  try {
    const { retentionDays = 90 } = req.body;

    await analyticsService.cleanupOldAnalyticsData(retentionDays);

    res.json({
      success: true,
      message: `Cleaned up analytics data older than ${retentionDays} days`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error cleaning up analytics data:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Initialize service
async function initializeService() {
  try {
    await connectionPool.initialize();
    await kafkaService.initialize();
    await analyticsService.initialize();

    logger.info(`Analytics Service started on port ${PORT}`);
  } catch (error) {
    logger.error('Failed to initialize Analytics Service:', error);
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