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
import { ReportingService } from './reporting-service.js';
import winston from 'winston';

const app = express();
const PORT = process.env.REPORTING_SERVICE_PORT || 3011;

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/reporting-service.log' })
  ]
});

// Initialize dependencies
const connectionPool = new DatabaseConnectionPool();
const kafkaService = new KafkaService();
const dualWriter = new DualDatabaseWriter(connectionPool);
const eventStore = new EventStore(connectionPool, kafkaService);
const commandBus = new CommandBus();
const queryBus = new QueryBus();

// Initialize Reporting Service
const reportingService = new ReportingService({
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

// Report Generation Routes
app.post('/reports/generate', async (req, res) => {
  try {
    const {
      reportType,
      parameters = {},
      format = 'json',
      userId
    } = req.body;

    if (!reportType) {
      return res.status(400).json({
        success: false,
        error: 'Report type is required',
        timestamp: new Date().toISOString()
      });
    }

    const result = await reportingService.generateReport(
      reportType,
      parameters,
      format,
      userId
    );

    res.status(201).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error generating report:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/reports/:id', async (req, res) => {
  try {
    const { includeData = 'true' } = req.query;

    const result = await reportingService.getReport(
      req.params.id,
      includeData === 'true'
    );

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Report not found',
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting report:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/reports', async (req, res) => {
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

    const criteria = {
      filters: {
        reportType,
        generatedBy
      },
      dateRange: {
        startDate,
        endDate
      },
      limit: parseInt(limit),
      offset: parseInt(offset),
      includeData: includeData === 'true'
    };

    const result = await reportingService.getReports(criteria);

    res.json({
      success: true,
      data: result,
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

// Legacy route compatibility
app.get('/reports/transactions', async (req, res) => {
  try {
    const { startDate, endDate, format = 'json', groupBy } = req.query;

    const result = await reportingService.generateReport(
      'transaction-summary',
      { startDate, endDate, groupBy },
      format
    );

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="transaction-report.csv"');
      return res.send(result.data);
    }

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error generating transaction report:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/reports/financial', async (req, res) => {
  try {
    const { startDate, endDate, type = 'summary', format = 'json' } = req.query;

    const result = await reportingService.generateReport(
      'financial-statement',
      { startDate, endDate, type },
      format
    );

    if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="financial-report.pdf"');
      return res.send(result.data);
    }

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error generating financial report:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/reports/compliance', async (req, res) => {
  try {
    const { startDate, endDate, reportType, format = 'json' } = req.query;

    const result = await reportingService.generateReport(
      'compliance-audit',
      { startDate, endDate, reportType },
      format
    );

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error generating compliance report:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/reports/user-activity', async (req, res) => {
  try {
    const { startDate, endDate, userId, format = 'json' } = req.query;

    const result = await reportingService.generateReport(
      'user-activity',
      { startDate, endDate, userId },
      format
    );

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error generating user activity report:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Scheduled Reports Routes
app.post('/reports/scheduled', async (req, res) => {
  try {
    const {
      name,
      reportType,
      schedule,
      parameters = {},
      format = 'json',
      recipients = [],
      deliveryMethod = 'email',
      isActive = true,
      createdBy
    } = req.body;

    const result = await reportingService.scheduleReport({
      name,
      reportType,
      schedule,
      parameters,
      format,
      recipients,
      deliveryMethod,
      isActive,
      createdBy
    });

    res.status(201).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error creating scheduled report:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/reports/scheduled', async (req, res) => {
  try {
    const {
      status = 'active',
      limit = 50,
      offset = 0,
      includeExecutionHistory = 'false'
    } = req.query;

    const criteria = {
      status,
      limit: parseInt(limit),
      offset: parseInt(offset),
      includeExecutionHistory: includeExecutionHistory === 'true'
    };

    const result = await reportingService.getScheduledReports(criteria);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting scheduled reports:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.put('/reports/scheduled/:id', async (req, res) => {
  try {
    const { updates, updatedBy } = req.body;

    updates.updatedBy = updatedBy;

    const result = await reportingService.updateScheduledReport(
      req.params.id,
      updates
    );

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error updating scheduled report:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.delete('/reports/scheduled/:id', async (req, res) => {
  try {
    const { deletedBy } = req.body;

    const result = await reportingService.deleteScheduledReport(
      req.params.id,
      deletedBy
    );

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error deleting scheduled report:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Report Templates Routes
app.post('/report-templates', async (req, res) => {
  try {
    const {
      name,
      description,
      reportType,
      template,
      parameters = {},
      filters = [],
      visualizations = [],
      isPublic = false,
      createdBy,
      tags = []
    } = req.body;

    const result = await reportingService.createReportTemplate({
      name,
      description,
      reportType,
      template,
      parameters,
      filters,
      visualizations,
      isPublic,
      createdBy,
      tags
    });

    res.status(201).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error creating report template:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/report-templates', async (req, res) => {
  try {
    const {
      userId,
      isPublic,
      reportType,
      search,
      tags,
      limit = 50,
      offset = 0
    } = req.query;

    const criteria = {
      userId,
      isPublic: isPublic === 'true',
      reportType,
      search,
      tags: tags ? tags.split(',') : [],
      limit: parseInt(limit),
      offset: parseInt(offset)
    };

    const result = await reportingService.getReportTemplates(criteria);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting report templates:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.put('/report-templates/:id', async (req, res) => {
  try {
    const { updates, updatedBy } = req.body;

    updates.updatedBy = updatedBy;

    const result = await reportingService.updateReportTemplate(
      req.params.id,
      updates
    );

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error updating report template:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Dashboard Routes
app.post('/dashboards', async (req, res) => {
  try {
    const {
      name,
      description,
      widgets = [],
      layout = {},
      filters = {},
      refreshInterval = 300,
      isPublic = false,
      createdBy,
      tags = []
    } = req.body;

    const result = await reportingService.createDashboard({
      name,
      description,
      widgets,
      layout,
      filters,
      refreshInterval,
      isPublic,
      createdBy,
      tags
    });

    res.status(201).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error creating dashboard:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/dashboards/:id', async (req, res) => {
  try {
    const { refreshData = 'false' } = req.query;

    const result = await reportingService.getDashboard(
      req.params.id,
      refreshData === 'true'
    );

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Dashboard not found',
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting dashboard:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/dashboards', async (req, res) => {
  try {
    const {
      userId,
      isPublic,
      search,
      tags,
      limit = 50,
      offset = 0
    } = req.query;

    const criteria = {
      userId,
      isPublic: isPublic === 'true',
      search,
      tags: tags ? tags.split(',') : [],
      limit: parseInt(limit),
      offset: parseInt(offset)
    };

    const result = await reportingService.getDashboards(criteria);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting dashboards:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.put('/dashboards/:id', async (req, res) => {
  try {
    const { updates, updatedBy } = req.body;

    updates.updatedBy = updatedBy;

    const result = await reportingService.updateDashboard(
      req.params.id,
      updates
    );

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error updating dashboard:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Analytics Routes
app.get('/analytics/reports', async (req, res) => {
  try {
    const {
      reportId,
      userId,
      startDate,
      endDate,
      groupBy = 'day'
    } = req.query;

    const criteria = {
      reportId,
      userId,
      dateRange: { startDate, endDate },
      groupBy
    };

    const result = await reportingService.getReportAnalytics(criteria);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting report analytics:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/analytics/metrics', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      groupBy = 'day',
      metrics
    } = req.query;

    const criteria = {
      dateRange: { startDate, endDate },
      groupBy,
      metrics: metrics ? metrics.split(',') : undefined
    };

    const result = await reportingService.getReportMetrics(criteria);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting report metrics:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Export Routes
app.post('/reports/:id/export', async (req, res) => {
  try {
    const {
      format,
      filters = {},
      userId
    } = req.body;

    const result = await reportingService.exportReportData(
      req.params.id,
      format,
      filters,
      userId
    );

    // Set appropriate headers based on format
    switch (format) {
      case 'csv':
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="export-${req.params.id}.csv"`);
        break;
      case 'xlsx':
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="export-${req.params.id}.xlsx"`);
        break;
      case 'pdf':
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="export-${req.params.id}.pdf"`);
        break;
      default:
        res.setHeader('Content-Type', 'application/json');
    }

    res.send(result.data);
  } catch (error) {
    logger.error('Error exporting report data:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Real-time Data Routes
app.post('/data/query', async (req, res) => {
  try {
    const {
      dataSource,
      query,
      filters = {},
      limit = 1000,
      sortBy,
      sortOrder,
      includeMetadata = true
    } = req.body;

    const result = await reportingService.getRealTimeData(
      dataSource,
      query,
      {
        filters,
        limit,
        sortBy,
        sortOrder,
        includeMetadata
      }
    );

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error querying real-time data:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Data Sources Routes
app.get('/data-sources', async (req, res) => {
  try {
    const {
      status,
      type,
      limit = 50,
      offset = 0
    } = req.query;

    const criteria = {
      status,
      type,
      limit: parseInt(limit),
      offset: parseInt(offset)
    };

    const result = await reportingService.getDataSources(criteria);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting data sources:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Report Execution History
app.get('/reports/executions', async (req, res) => {
  try {
    const {
      reportId,
      scheduledReportId,
      status,
      startDate,
      endDate,
      limit = 100,
      offset = 0
    } = req.query;

    const criteria = {
      reportId,
      scheduledReportId,
      status,
      dateRange: { startDate, endDate },
      limit: parseInt(limit),
      offset: parseInt(offset)
    };

    const result = await reportingService.getReportExecutionHistory(criteria);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting report execution history:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Template Usage Analytics
app.get('/report-templates/:id/usage', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      groupBy = 'day',
      includeUsers = 'false',
      limit = 50
    } = req.query;

    const result = await reportingService.getReportTemplateUsage(
      req.params.id,
      { startDate, endDate },
      {
        groupBy,
        includeUsers: includeUsers === 'true',
        limit: parseInt(limit)
      }
    );

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting template usage:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Cache Routes
app.get('/cache/:key', async (req, res) => {
  try {
    const { allowStale = 'true' } = req.query;

    const result = await reportingService.getCachedReportData(
      req.params.key,
      allowStale === 'true'
    );

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Cache entry not found',
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting cached data:', error);
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
    service: 'reporting-service',
    timestamp: new Date().toISOString(),
    dependencies: {
      database: connectionPool.getStats(),
      dualWriter: dualWriter.getStats(),
      kafka: kafkaService.getStats(),
      eventStore: eventStore.getStats(),
      reportingService: reportingService.getHealthStatus()
    }
  });
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
  res.json({
    service: 'reporting-service',
    timestamp: new Date().toISOString(),
    database: connectionPool.getStats(),
    dualWriter: dualWriter.getStats(),
    kafka: kafkaService.getStats(),
    eventStore: eventStore.getStats(),
    cqrs: {
      commandsProcessed: commandBus.getProcessedCount(),
      queriesProcessed: queryBus.getProcessedCount()
    },
    reportingService: reportingService.getHealthStatus()
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
    await reportingService.initialize();

    logger.info(`Reporting Service started on port ${PORT}`);
  } catch (error) {
    logger.error('Failed to initialize Reporting Service:', error);
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