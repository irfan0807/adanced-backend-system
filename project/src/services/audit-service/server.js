import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import DatabaseConnectionPool from '../../shared/database/connection-pool.js';
import DualDatabaseWriter from '../../shared/database/dual-writer.js';
import { KafkaService } from '../../shared/messaging/kafka-service.js';
import CommandBus from '../../shared/cqrs/command-bus.js';
import QueryBus from '../../shared/cqrs/query-bus.js';
import EventStore from '../../shared/event-sourcing/event-store.js';
import winston from 'winston';
import { AuditService } from './audit-service.js';

const app = express();
const PORT = process.env.AUDIT_SERVICE_PORT || 3006;

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/audit-service.log' })
  ]
});

// Initialize dependencies
const connectionPool = new DatabaseConnectionPool();
const kafkaService = new KafkaService();
const dualWriter = new DualDatabaseWriter(connectionPool);
const eventStore = new EventStore(connectionPool, kafkaService);
const commandBus = new CommandBus();
const queryBus = new QueryBus();

// Initialize Audit Service
const auditService = new AuditService({
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

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const healthStatus = await auditService.getAuditHealthStatus();
    res.json(healthStatus);
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(500).json({
      status: 'unhealthy',
      service: 'audit-service',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Command Routes (Write Operations)

// Log single audit event
app.post('/audit-logs', async (req, res) => {
  try {
    const { userId, action, resource, resourceId, details, ipAddress, userAgent, riskScore, complianceFlags, metadata } = req.body;

    const result = await auditService.logAuditEvent({
      userId,
      action,
      resource,
      resourceId,
      details,
      ipAddress,
      userAgent,
      riskScore,
      complianceFlags,
      metadata
    });

    res.status(201).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error logging audit event:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Bulk log audit events
app.post('/audit-logs/bulk', async (req, res) => {
  try {
    const { events } = req.body;

    const result = await auditService.bulkLogAuditEvents({
      events
    });

    res.status(201).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error bulk logging audit events:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Archive audit logs
app.post('/audit-logs/archive', async (req, res) => {
  try {
    const { olderThan, archiveLocation, approvedBy, complianceApproval } = req.body;

    const result = await auditService.archiveAuditLogs({
      olderThan,
      archiveLocation,
      approvedBy,
      complianceApproval
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error archiving audit logs:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Purge audit logs
app.delete('/audit-logs', async (req, res) => {
  try {
    const { olderThan, forceDelete, backupFirst, approvedBy, complianceApproval } = req.body;

    const result = await auditService.purgeAuditLogs({
      olderThan,
      forceDelete,
      backupFirst,
      approvedBy,
      complianceApproval
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error purging audit logs:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Flag suspicious activity
app.post('/audit-logs/suspicious', async (req, res) => {
  try {
    const { auditLogId, userId, activityType, severity, riskScore, indicators, metadata } = req.body;

    const result = await auditService.flagSuspiciousActivity({
      auditLogId,
      userId,
      activityType,
      severity,
      riskScore,
      indicators,
      metadata
    });

    res.status(201).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error flagging suspicious activity:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Generate audit report
app.post('/audit-reports', async (req, res) => {
  try {
    const { reportType, startDate, endDate, filters, format, requestedBy } = req.body;

    const result = await auditService.generateAuditReport({
      reportType,
      startDate,
      endDate,
      filters,
      format,
      requestedBy
    });

    res.status(201).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error generating audit report:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Update retention policy
app.put('/audit-retention', async (req, res) => {
  try {
    const { policyId, name, description, retentionRules, complianceRequirements, autoArchive, autoPurge, approvedBy } = req.body;

    const result = await auditService.updateAuditRetentionPolicy({
      policyId,
      name,
      description,
      retentionRules,
      complianceRequirements,
      autoArchive,
      autoPurge,
      approvedBy
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error updating retention policy:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Query Routes (Read Operations)

// Get audit logs with filtering
app.get('/audit-logs', async (req, res) => {
  try {
    const { page, limit, userId, action, resource, resourceId, startDate, endDate, riskScore, complianceFlags, sortBy, sortOrder } = req.query;

    const result = await auditService.getAuditLogs({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      userId,
      action,
      resource,
      resourceId,
      startDate,
      endDate,
      riskScore: riskScore ? parseInt(riskScore) : undefined,
      complianceFlags: complianceFlags ? complianceFlags.split(',') : undefined,
      sortBy: sortBy || 'timestamp',
      sortOrder: sortOrder || 'desc'
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting audit logs:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get audit log by ID
app.get('/audit-logs/:id', async (req, res) => {
  try {
    const result = await auditService.getAuditLogById({
      auditLogId: req.params.id
    });

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Audit log not found',
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting audit log by ID:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get user audit trail
app.get('/audit-logs/user/:userId', async (req, res) => {
  try {
    const { page, limit, startDate, endDate, resource, action } = req.query;

    const result = await auditService.getUserAuditTrail({
      userId: req.params.userId,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      startDate,
      endDate,
      resource,
      action
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting user audit trail:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get resource audit trail
app.get('/audit-logs/resource/:resource/:resourceId', async (req, res) => {
  try {
    const { page, limit, startDate, endDate, userId, action } = req.query;

    const result = await auditService.getResourceAuditTrail({
      resource: req.params.resource,
      resourceId: req.params.resourceId,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      startDate,
      endDate,
      userId,
      action
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting resource audit trail:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get audit statistics
app.get('/audit-logs/statistics', async (req, res) => {
  try {
    const { startDate, endDate, metrics, groupBy } = req.query;

    const result = await auditService.getAuditStatistics({
      startDate,
      endDate,
      metrics: metrics ? metrics.split(',') : ['total_events', 'unique_users', 'risk_distribution'],
      groupBy: groupBy || 'day'
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting audit statistics:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get suspicious activities
app.get('/audit-logs/suspicious', async (req, res) => {
  try {
    const { page, limit, severity, startDate, endDate, userId, activityType } = req.query;

    const result = await auditService.getSuspiciousActivities({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      severity,
      startDate,
      endDate,
      userId,
      activityType
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting suspicious activities:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get compliance report
app.get('/audit-reports/compliance', async (req, res) => {
  try {
    const { complianceStandard, startDate, endDate, reportType } = req.query;

    const result = await auditService.getComplianceReport({
      complianceStandard,
      startDate,
      endDate,
      reportType: reportType || 'summary'
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting compliance report:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get audit retention status
app.get('/audit-retention/status', async (req, res) => {
  try {
    const result = await auditService.getAuditRetentionStatus({});

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting retention status:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get system access log
app.get('/audit-logs/system-access', async (req, res) => {
  try {
    const { page, limit, startDate, endDate, component, action } = req.query;

    const result = await auditService.getSystemAccessLog({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      startDate,
      endDate,
      component,
      action
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting system access log:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get data access audit
app.get('/audit-logs/data-access', async (req, res) => {
  try {
    const { page, limit, startDate, endDate, dataType, userId, accessType } = req.query;

    const result = await auditService.getDataAccessAudit({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      startDate,
      endDate,
      dataType,
      userId,
      accessType
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting data access audit:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Utility endpoints
app.post('/audit-logs/cache/clear', async (req, res) => {
  try {
    await auditService.clearCache();

    res.json({
      success: true,
      message: 'Cache cleared successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error clearing cache:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/audit-logs/cleanup', async (req, res) => {
  try {
    const { retentionDays } = req.body;

    await auditService.cleanupOldAuditData(retentionDays || 2555);

    res.json({
      success: true,
      message: 'Cleanup completed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error during cleanup:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
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
    await auditService.initialize();

    logger.info(`Audit Service started on port ${PORT}`);
  } catch (error) {
    logger.error('Failed to initialize Audit Service:', error);
    process.exit(1);
  }
}

app.listen(PORT, () => {
  initializeService();
});

export default app;

app.get('/audit-logs', async (req, res) => {
  try {
    const { page = 1, limit = 20, userId, action, resource, startDate, endDate } = req.query;

    // Get audit logs with filters logic here
    const auditLogs = await getAuditLogs({
      page: parseInt(page),
      limit: parseInt(limit),
      userId,
      action,
      resource,
      startDate,
      endDate
    });

    res.json({
      success: true,
      data: auditLogs,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting audit logs:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/audit-logs/:id', async (req, res) => {
  try {
    // Get audit log by ID logic here
    const auditLog = await getAuditLogById(req.params.id);
    if (!auditLog) {
      return res.status(404).json({
        success: false,
        error: 'Audit log not found',
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: auditLog,
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

app.get('/audit-logs/user/:userId', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    // Get user audit logs logic here
    const auditLogs = await getAuditLogsByUserId(req.params.userId, {
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      data: auditLogs,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting user audit logs:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Event consumers for automatic audit logging
const eventConsumers = {
  'transaction-events': async (message) => {
    try {
      const event = JSON.parse(message.value.toString());
      await createAuditLogFromEvent(event, 'transaction');
      await processAlerts(event, 'transaction');
    } catch (error) {
      logger.error('Error processing transaction event for audit:', error);
    }
  },
  'user-events': async (message) => {
    try {
      const event = JSON.parse(message.value.toString());
      await createAuditLogFromEvent(event, 'user');
      await processAlerts(event, 'user');
    } catch (error) {
      logger.error('Error processing user event for audit:', error);
    }
  },
  'account-events': async (message) => {
    try {
      const event = JSON.parse(message.value.toString());
      await createAuditLogFromEvent(event, 'account');
      await processAlerts(event, 'account');
    } catch (error) {
      logger.error('Error processing account event for audit:', error);
    }
  },
  'payment-events': async (message) => {
    try {
      const event = JSON.parse(message.value.toString());
      await createAuditLogFromEvent(event, 'payment');
      await processAlerts(event, 'payment');
    } catch (error) {
      logger.error('Error processing payment event for audit:', error);
    }
  },
  'notification-events': async (message) => {
    try {
      const event = JSON.parse(message.value.toString());
      await createAuditLogFromEvent(event, 'notification');
      await processAlerts(event, 'notification');
    } catch (error) {
      logger.error('Error processing notification event for audit:', error);
    }
  },
  'audit-events': async (message) => {
    // Skip auditing audit events to prevent infinite loop
  }
};

app.get('/audit-logs/statistics', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const statistics = await getAuditStatistics({
      startDate,
      endDate
    });

    res.json({
      success: true,
      data: statistics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting audit statistics:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/audit-logs/export', async (req, res) => {
  try {
    const { format = 'json', userId, action, resource, startDate, endDate } = req.query;

    const exportedData = await exportAuditLogs({
      userId,
      action,
      resource,
      startDate,
      endDate
    }, format);

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="audit-logs.csv"');
      res.send(exportedData);
    } else {
      res.json({
        success: true,
        data: exportedData,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    logger.error('Error exporting audit logs:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/audit-logs/cleanup', async (req, res) => {
  try {
    const { retentionDays = 365 } = req.body; // Default 1 year retention

    const deletedCount = await cleanupOldAuditLogs(retentionDays);

    res.json({
      success: true,
      data: { deletedCount },
      message: `Cleaned up ${deletedCount} old audit logs`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error cleaning up audit logs:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/audit-logs/verify/:id', async (req, res) => {
  try {
    const auditLog = await getAuditLogById(req.params.id);
    if (!auditLog) {
      return res.status(404).json({
        success: false,
        error: 'Audit log not found',
        timestamp: new Date().toISOString()
      });
    }

    const isValid = verifyAuditLogIntegrity(auditLog);

    res.json({
      success: true,
      data: { isValid },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error verifying audit log:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/audit-logs/search', async (req, res) => {
  try {
    const { q, page = 1, limit = 20, userId, action, resource, startDate, endDate } = req.query;

    const results = await searchAuditLogs({
      query: q,
      page: parseInt(page),
      limit: parseInt(limit),
      userId,
      action,
      resource,
      startDate,
      endDate
    });

    res.json({
      success: true,
      data: results,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error searching audit logs:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/audit-logs/user/:userId/timeline', async (req, res) => {
  try {
    const { startDate, endDate, includeDetails = false } = req.query;

    const timeline = await getUserActivityTimeline(req.params.userId, {
      startDate,
      endDate,
      includeDetails: includeDetails === 'true'
    });

    res.json({
      success: true,
      data: timeline,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting user timeline:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/audit-logs/suspicious-activities', async (req, res) => {
  try {
    const { startDate, endDate, severity = 'medium' } = req.query;

    const activities = await detectSuspiciousActivities({
      startDate,
      endDate,
      severity
    });

    res.json({
      success: true,
      data: activities,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error detecting suspicious activities:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/audit-logs/compliance/:type', async (req, res) => {
  try {
    const { startDate, endDate, format = 'json' } = req.query;
    const complianceType = req.params.type.toUpperCase();

    const report = await generateComplianceReport(complianceType, {
      startDate,
      endDate,
      format
    });

    if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${complianceType}-report.pdf"`);
      res.send(report);
    } else {
      res.json({
        success: true,
        data: report,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    logger.error('Error generating compliance report:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/audit-logs/bulk-delete', async (req, res) => {
  try {
    const { filters, confirmation } = req.body;

    if (confirmation !== 'DELETE_ALL_MATCHING_LOGS') {
      return res.status(400).json({
        success: false,
        error: 'Confirmation required for bulk delete',
        timestamp: new Date().toISOString()
      });
    }

    const deletedCount = await bulkDeleteAuditLogs(filters);

    res.json({
      success: true,
      data: { deletedCount },
      message: `Deleted ${deletedCount} audit logs`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error bulk deleting audit logs:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/audit-logs/reconstruct/:entityId', async (req, res) => {
  try {
    const { entityType, startDate, endDate } = req.query;

    const trail = await reconstructAuditTrail(req.params.entityId, {
      entityType,
      startDate,
      endDate
    });

    res.json({
      success: true,
      data: trail,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error reconstructing audit trail:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/audit-logs/alerts', async (req, res) => {
  try {
    const { ruleName, conditions, webhookUrl, enabled = true } = req.body;

    const alertRule = await createAlertRule({
      ruleName,
      conditions,
      webhookUrl,
      enabled
    });

    res.status(201).json({
      success: true,
      data: alertRule,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error creating alert rule:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/audit-logs/alerts', async (req, res) => {
  try {
    const alerts = await getAlertRules();

    res.json({
      success: true,
      data: alerts,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting alert rules:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/audit-logs/alerts/history', async (req, res) => {
  try {
    const { page = 1, limit = 20, startDate, endDate } = req.query;

    const history = await getAlertHistory({
      page: parseInt(page),
      limit: parseInt(limit),
      startDate,
      endDate
    });

    res.json({
      success: true,
      data: history,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting alert history:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/audit-logs/archive', async (req, res) => {
  try {
    const { archivePath, compression = 'gzip', retentionDays = 2555 } = req.body; // 7 years

    const result = await archiveOldLogs({
      archivePath,
      compression,
      retentionDays
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error archiving audit logs:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/audit-logs/config', async (req, res) => {
  try {
    const config = await getAuditConfiguration();

    res.json({
      success: true,
      data: config,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting audit configuration:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.put('/audit-logs/config', async (req, res) => {
  try {
    const updates = req.body;

    const config = await updateAuditConfiguration(updates);

    res.json({
      success: true,
      data: config,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error updating audit configuration:', error);
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
    service: 'audit-service',
    timestamp: new Date().toISOString(),
    dependencies: {
      database: connectionPool.getStats(),
      dualWriter: dualWriter.getStats()
    }
  });
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
  res.json({
    service: 'audit-service',
    timestamp: new Date().toISOString(),
    database: connectionPool.getStats(),
    dualWriter: dualWriter.getStats()
  });
});

// Helper functions
async function getAuditLogs(filters) {
  try {
    const { page = 1, limit = 20, userId, action, resource, startDate, endDate } = filters;
    const offset = (page - 1) * limit;

    let whereClause = '';
    let params = [];

    if (userId) {
      whereClause += ' AND user_id = ?';
      params.push(userId);
    }

    if (action) {
      whereClause += ' AND action = ?';
      params.push(action);
    }

    if (resource) {
      whereClause += ' AND resource = ?';
      params.push(resource);
    }

    if (startDate) {
      whereClause += ' AND timestamp >= ?';
      params.push(startDate);
    }

    if (endDate) {
      whereClause += ' AND timestamp <= ?';
      params.push(endDate);
    }

    // Try MySQL first (primary)
    const mysqlResult = await connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT * FROM audit_logs WHERE 1=1 ${whereClause} ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );
      return rows;
    });

    if (mysqlResult && mysqlResult.length > 0) {
      return mysqlResult;
    }

    // Fallback to MongoDB
    const mongoDB = connectionPool.getMongoDatabase();
    const query = {};

    if (userId) query.userId = userId;
    if (action) query.action = action;
    if (resource) query.resource = resource;
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    const mongoResult = await mongoDB.collection('audit_logs')
      .find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .skip(offset)
      .toArray();

    return mongoResult;
  } catch (error) {
    logger.error('Error getting audit logs:', error);
    throw error;
  }
}

async function getAuditLogById(auditLogId) {
  try {
    // Try MySQL first (primary)
    const mysqlResult = await connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT * FROM audit_logs WHERE id = ?',
        [auditLogId]
      );
      return rows[0];
    });

    if (mysqlResult) {
      return mysqlResult;
    }

    // Fallback to MongoDB
    const mongoDB = connectionPool.getMongoDatabase();
    const mongoResult = await mongoDB.collection('audit_logs').findOne({
      id: auditLogId
    });

    return mongoResult;
  } catch (error) {
    logger.error('Error getting audit log by ID:', error);
    throw error;
  }
}

async function getAuditLogsByUserId(userId, pagination) {
  try {
    const { page = 1, limit = 20 } = pagination;
    const offset = (page - 1) * limit;

    // Try MySQL first (primary)
    const mysqlResult = await connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT * FROM audit_logs WHERE user_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?',
        [userId, limit, offset]
      );
      return rows;
    });

    if (mysqlResult && mysqlResult.length > 0) {
      return mysqlResult;
    }

    // Fallback to MongoDB
    const mongoDB = connectionPool.getMongoDatabase();
    const mongoResult = await mongoDB.collection('audit_logs')
      .find({ userId: userId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .skip(offset)
      .toArray();

    return mongoResult;
  } catch (error) {
    logger.error('Error getting audit logs by user ID:', error);
    throw error;
  }
}

// Event processing functions for automatic audit logging
async function createAuditLogFromEvent(event, resourceType) {
  try {
    const auditLog = {
      id: uuidv4(),
      userId: event.userId || event.accountId || null,
      action: mapEventTypeToAction(event.eventType),
      resource: resourceType,
      resourceId: event[`${resourceType}Id`] || event.id,
      details: JSON.stringify(event),
      ipAddress: null, // System events don't have IP
      userAgent: 'SYSTEM',
      timestamp: event.timestamp || new Date().toISOString(),
      hash: generateAuditHash(event) // For integrity checking
    };

    // Write to databases directly (not using dual writer for audit logs)
    await connectionPool.executeWithMySQLConnection(async (connection) => {
      await connection.execute(
        'INSERT INTO audit_logs (id, user_id, action, resource, resource_id, details, ip_address, user_agent, timestamp, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [auditLog.id, auditLog.userId, auditLog.action, auditLog.resource, auditLog.resourceId, auditLog.details, auditLog.ipAddress, auditLog.userAgent, auditLog.timestamp, auditLog.hash]
      );
    });

    // Also write to MongoDB
    const mongoDB = connectionPool.getMongoDatabase();
    await mongoDB.collection('audit_logs').insertOne(auditLog);

    logger.info(`Audit log created for ${resourceType} event: ${event.eventType}`);
  } catch (error) {
    logger.error('Error creating audit log from event:', error);
  }
}

async function processAlerts(event, resourceType) {
  try {
    const alertRules = await getAlertRules();

    for (const rule of alertRules) {
      if (!rule.enabled) continue;

      const shouldTrigger = evaluateAlertCondition(event, rule.conditions);

      if (shouldTrigger) {
        await triggerAlert(rule, event);
        rule.lastTriggered = new Date().toISOString();
      }
    }
  } catch (error) {
    logger.error('Error processing alerts:', error);
  }
}

function evaluateAlertCondition(event, conditions) {
  try {
    // Simple condition evaluation (in a real implementation, use a proper rules engine)
    for (const condition of conditions) {
      const { field, operator, value } = condition;

      let fieldValue = event[field];
      if (field === 'eventType') fieldValue = event.eventType;
      if (field === 'resource') fieldValue = event.resource || 'unknown';

      switch (operator) {
        case 'equals':
          if (fieldValue !== value) return false;
          break;
        case 'contains':
          if (!fieldValue || !fieldValue.includes(value)) return false;
          break;
        case 'greater_than':
          if (parseFloat(fieldValue) <= parseFloat(value)) return false;
          break;
        case 'less_than':
          if (parseFloat(fieldValue) >= parseFloat(value)) return false;
          break;
        default:
          return false;
      }
    }

    return true;
  } catch (error) {
    logger.error('Error evaluating alert condition:', error);
    return false;
  }
}

async function triggerAlert(rule, event) {
  try {
    const alertPayload = {
      ruleName: rule.ruleName,
      triggeredAt: new Date().toISOString(),
      event: event,
      severity: rule.conditions.find(c => c.field === 'severity')?.value || 'medium'
    };

    if (rule.webhookUrl) {
      // In a real implementation, send HTTP request to webhook
      logger.info(`Alert triggered: ${rule.ruleName} - Webhook: ${rule.webhookUrl}`, alertPayload);
    } else {
      // Log the alert
      logger.warn(`Alert triggered: ${rule.ruleName}`, alertPayload);
    }

    // Store alert in database for tracking
    await connectionPool.executeWithMySQLConnection(async (connection) => {
      await connection.execute(
        'INSERT INTO audit_alerts (id, rule_name, event_data, triggered_at) VALUES (?, ?, ?, ?)',
        [uuidv4(), rule.ruleName, JSON.stringify(alertPayload), alertPayload.triggeredAt]
      );
    });

  } catch (error) {
    logger.error('Error triggering alert:', error);
  }
}

function mapEventTypeToAction(eventType) {
  const actionMap = {
    'USER_REGISTERED': 'CREATE',
    'USER_LOGIN': 'LOGIN',
    'USER_LOGOUT': 'LOGOUT',
    'USER_UPDATED': 'UPDATE',
    'USER_DELETED': 'DELETE',
    'ACCOUNT_CREATED': 'CREATE',
    'ACCOUNT_UPDATED': 'UPDATE',
    'ACCOUNT_BALANCE_UPDATED': 'UPDATE',
    'ACCOUNT_STATUS_UPDATED': 'UPDATE',
    'TRANSACTION_CREATED': 'CREATE',
    'TRANSACTION_UPDATED': 'UPDATE',
    'TRANSACTION_COMPLETED': 'COMPLETE',
    'TRANSACTION_FAILED': 'FAIL',
    'PAYMENT_INITIATED': 'CREATE',
    'PAYMENT_COMPLETED': 'COMPLETE',
    'PAYMENT_FAILED': 'FAIL',
    'NOTIFICATION_SENT': 'SEND'
  };
  return actionMap[eventType] || 'UNKNOWN';
}

function generateAuditHash(event) {
  // Simple hash for integrity checking
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify(event));
  return hash.digest('hex');
}

// Additional audit functions
async function getAuditStatistics(filters) {
  try {
    const { startDate, endDate } = filters;

    let dateFilter = '';
    let params = [];

    if (startDate) {
      dateFilter += ' AND timestamp >= ?';
      params.push(startDate);
    }

    if (endDate) {
      dateFilter += ' AND timestamp <= ?';
      params.push(endDate);
    }

    const stats = await connectionPool.executeWithMySQLConnection(async (connection) => {
      // Total audit logs
      const [totalLogs] = await connection.execute(
        `SELECT COUNT(*) as totalLogs FROM audit_logs WHERE 1=1 ${dateFilter}`,
        params
      );

      // Actions by type
      const [actionsByType] = await connection.execute(
        `SELECT action, COUNT(*) as count FROM audit_logs WHERE 1=1 ${dateFilter} GROUP BY action`,
        params
      );

      // Resources by type
      const [resourcesByType] = await connection.execute(
        `SELECT resource, COUNT(*) as count FROM audit_logs WHERE 1=1 ${dateFilter} GROUP BY resource`,
        params
      );

      // Top users by activity
      const [topUsers] = await connection.execute(
        `SELECT user_id, COUNT(*) as activityCount FROM audit_logs WHERE user_id IS NOT NULL AND 1=1 ${dateFilter} GROUP BY user_id ORDER BY activityCount DESC LIMIT 10`,
        params
      );

      return {
        totalLogs: totalLogs[0]?.totalLogs || 0,
        actionsByType: actionsByType.reduce((acc, stat) => {
          acc[stat.action] = stat.count;
          return acc;
        }, {}),
        resourcesByType: resourcesByType.reduce((acc, stat) => {
          acc[stat.resource] = stat.count;
          return acc;
        }, {}),
        topUsers: topUsers.map(user => ({
          userId: user.user_id,
          activityCount: user.activityCount
        }))
      };
    });

    return stats;
  } catch (error) {
    logger.error('Error getting audit statistics:', error);
    throw error;
  }
}

async function exportAuditLogs(filters, format = 'json') {
  try {
    const auditLogs = await getAuditLogs({ ...filters, page: 1, limit: 10000 }); // Large limit for export

    if (format === 'csv') {
      // Convert to CSV format
      const csvHeaders = ['id', 'userId', 'action', 'resource', 'resourceId', 'details', 'ipAddress', 'userAgent', 'timestamp'];
      const csvRows = auditLogs.map(log => [
        log.id,
        log.userId || '',
        log.action,
        log.resource,
        log.resourceId || '',
        JSON.stringify(log.details).replace(/"/g, '""'), // Escape quotes
        log.ipAddress || '',
        log.userAgent || '',
        log.timestamp
      ]);

      return [csvHeaders, ...csvRows].map(row => row.join(',')).join('\n');
    }

    return auditLogs; // JSON format
  } catch (error) {
    logger.error('Error exporting audit logs:', error);
    throw error;
  }
}

// Data retention and cleanup functions
async function cleanupOldAuditLogs(retentionDays) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffISOString = cutoffDate.toISOString();

    let deletedCount = 0;

    // Delete from MySQL
    const mysqlDeleted = await connectionPool.executeWithMySQLConnection(async (connection) => {
      const [result] = await connection.execute(
        'DELETE FROM audit_logs WHERE timestamp < ?',
        [cutoffISOString]
      );
      return result.affectedRows;
    });
    deletedCount += mysqlDeleted;

    // Delete from MongoDB
    const mongoDB = connectionPool.getMongoDatabase();
    const mongoDeleted = await mongoDB.collection('audit_logs').deleteMany({
      timestamp: { $lt: new Date(cutoffISOString) }
    });
    deletedCount += mongoDeleted.deletedCount;

    logger.info(`Cleaned up ${deletedCount} audit logs older than ${retentionDays} days`);
    return deletedCount;
  } catch (error) {
    logger.error('Error cleaning up old audit logs:', error);
    throw error;
  }
}

// Audit log integrity verification
function verifyAuditLogIntegrity(auditLog) {
  try {
    if (!auditLog.hash) {
      return false; // No hash to verify
    }

    // Recreate the event data from audit log
    const eventData = {
      eventType: mapActionToEventType(auditLog.action),
      userId: auditLog.userId,
      [`${auditLog.resource}Id`]: auditLog.resourceId,
      timestamp: auditLog.timestamp,
      ...JSON.parse(auditLog.details || '{}')
    };

    // Generate hash and compare
    const expectedHash = generateAuditHash(eventData);
    return expectedHash === auditLog.hash;
  } catch (error) {
    logger.error('Error verifying audit log integrity:', error);
    return false;
  }
}

function mapActionToEventType(action) {
  const eventMap = {
    'CREATE': 'CREATED',
    'UPDATE': 'UPDATED',
    'DELETE': 'DELETED',
    'LOGIN': 'USER_LOGIN',
    'LOGOUT': 'USER_LOGOUT',
    'COMPLETE': 'COMPLETED',
    'FAIL': 'FAILED',
    'SEND': 'SENT'
  };
  return eventMap[action] || action;
}

// Advanced audit functionality
async function searchAuditLogs(filters) {
  try {
    const { query, page = 1, limit = 20, userId, action, resource, startDate, endDate } = filters;
    const offset = (page - 1) * limit;

    let whereClause = '';
    let params = [];

    if (userId) {
      whereClause += ' AND user_id = ?';
      params.push(userId);
    }

    if (action) {
      whereClause += ' AND action = ?';
      params.push(action);
    }

    if (resource) {
      whereClause += ' AND resource = ?';
      params.push(resource);
    }

    if (startDate) {
      whereClause += ' AND timestamp >= ?';
      params.push(startDate);
    }

    if (endDate) {
      whereClause += ' AND timestamp <= ?';
      params.push(endDate);
    }

    if (query) {
      whereClause += ' AND (details LIKE ? OR ip_address LIKE ? OR user_agent LIKE ?)';
      params.push(`%${query}%`, `%${query}%`, `%${query}%`);
    }

    const mysqlResult = await connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT * FROM audit_logs WHERE 1=1 ${whereClause} ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );
      return rows;
    });

    if (mysqlResult && mysqlResult.length > 0) {
      return mysqlResult;
    }

    // Fallback to MongoDB with text search
    const mongoDB = connectionPool.getMongoDatabase();
    const searchQuery = {};

    if (userId) searchQuery.userId = userId;
    if (action) searchQuery.action = action;
    if (resource) searchQuery.resource = resource;
    if (startDate || endDate) {
      searchQuery.timestamp = {};
      if (startDate) searchQuery.timestamp.$gte = new Date(startDate);
      if (endDate) searchQuery.timestamp.$lte = new Date(endDate);
    }

    if (query) {
      searchQuery.$text = { $search: query };
    }

    const mongoResult = await mongoDB.collection('audit_logs')
      .find(searchQuery)
      .sort({ timestamp: -1 })
      .limit(limit)
      .skip(offset)
      .toArray();

    return mongoResult;
  } catch (error) {
    logger.error('Error searching audit logs:', error);
    throw error;
  }
}

async function getUserActivityTimeline(userId, options) {
  try {
    const { startDate, endDate, includeDetails = false } = options;

    let dateFilter = '';
    let params = [userId];

    if (startDate) {
      dateFilter += ' AND timestamp >= ?';
      params.push(startDate);
    }

    if (endDate) {
      dateFilter += ' AND timestamp <= ?';
      params.push(endDate);
    }

    const mysqlResult = await connectionPool.executeWithMySQLConnection(async (connection) => {
      const selectFields = includeDetails ?
        '*' :
        'id, action, resource, resource_id, timestamp, ip_address';

      const [rows] = await connection.execute(
        `SELECT ${selectFields} FROM audit_logs WHERE user_id = ? ${dateFilter} ORDER BY timestamp ASC`,
        params
      );
      return rows;
    });

    if (mysqlResult && mysqlResult.length > 0) {
      return mysqlResult;
    }

    // Fallback to MongoDB
    const mongoDB = connectionPool.getMongoDatabase();
    const query = { userId };

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    const projection = includeDetails ? {} : {
      id: 1, action: 1, resource: 1, resourceId: 1, timestamp: 1, ipAddress: 1
    };

    const mongoResult = await mongoDB.collection('audit_logs')
      .find(query, { projection })
      .sort({ timestamp: 1 })
      .toArray();

    return mongoResult;
  } catch (error) {
    logger.error('Error getting user activity timeline:', error);
    throw error;
  }
}

async function detectSuspiciousActivities(filters) {
  try {
    const { startDate, endDate, severity = 'medium' } = filters;

    let dateFilter = '';
    let params = [];

    if (startDate) {
      dateFilter += ' AND timestamp >= ?';
      params.push(startDate);
    }

    if (endDate) {
      dateFilter += ' AND timestamp <= ?';
      params.push(endDate);
    }

    const suspiciousActivities = [];

    const mysqlResult = await connectionPool.executeWithMySQLConnection(async (connection) => {
      // Detect multiple failed logins from same IP
      if (severity === 'high' || severity === 'medium') {
        const [failedLogins] = await connection.execute(
          `SELECT ip_address, COUNT(*) as failed_count, GROUP_CONCAT(timestamp) as timestamps
           FROM audit_logs
           WHERE action = 'LOGIN_FAILED' ${dateFilter}
           GROUP BY ip_address
           HAVING failed_count >= 5`,
          params
        );

        suspiciousActivities.push(...failedLogins.map(login => ({
          type: 'MULTIPLE_FAILED_LOGINS',
          severity: 'high',
          ipAddress: login.ip_address,
          count: login.failed_count,
          timestamps: login.timestamps.split(','),
          description: `Multiple failed login attempts from ${login.ip_address}`
        })));
      }

      // Detect unusual access patterns
      if (severity === 'medium' || severity === 'low') {
        const [unusualAccess] = await connection.execute(
          `SELECT user_id, COUNT(DISTINCT ip_address) as unique_ips, COUNT(*) as total_actions
           FROM audit_logs
           WHERE action IN ('LOGIN', 'DATA_ACCESS') ${dateFilter}
           GROUP BY user_id
           HAVING unique_ips >= 3 AND total_actions >= 10`,
          params
        );

        suspiciousActivities.push(...unusualAccess.map(access => ({
          type: 'UNUSUAL_ACCESS_PATTERN',
          severity: 'medium',
          userId: access.user_id,
          uniqueIPs: access.unique_ips,
          totalActions: access.total_actions,
          description: `User accessing from multiple IP addresses`
        })));
      }

      // Detect rapid successive actions
      const [rapidActions] = await connection.execute(
        `SELECT user_id, COUNT(*) as action_count,
                TIMESTAMPDIFF(MINUTE, MIN(timestamp), MAX(timestamp)) as time_span
         FROM audit_logs
         WHERE 1=1 ${dateFilter}
         GROUP BY user_id
         HAVING action_count >= 50 AND time_span <= 5`,
        params
      );

      suspiciousActivities.push(...rapidActions.map(action => ({
        type: 'RAPID_SUCCESSIVE_ACTIONS',
        severity: 'medium',
        userId: action.user_id,
        actionCount: action.action_count,
        timeSpan: action.time_span,
        description: `Unusually rapid sequence of actions`
      })));

      return suspiciousActivities;
    });

    return suspiciousActivities;
  } catch (error) {
    logger.error('Error detecting suspicious activities:', error);
    throw error;
  }
}

async function generateComplianceReport(complianceType, options) {
  try {
    const { startDate, endDate, format } = options;

    let report = {
      complianceType,
      period: { startDate, endDate },
      generatedAt: new Date().toISOString(),
      sections: []
    };

    switch (complianceType) {
      case 'SOX':
        report.sections = await generateSOXReport(startDate, endDate);
        break;
      case 'GDPR':
        report.sections = await generateGDPRReport(startDate, endDate);
        break;
      case 'PCI-DSS':
        report.sections = await generatePCIDSSReport(startDate, endDate);
        break;
      default:
        throw new Error(`Unsupported compliance type: ${complianceType}`);
    }

    if (format === 'pdf') {
      // In a real implementation, use a PDF library like pdfkit
      return Buffer.from(JSON.stringify(report, null, 2));
    }

    return report;
  } catch (error) {
    logger.error('Error generating compliance report:', error);
    throw error;
  }
}

async function generateSOXReport(startDate, endDate) {
  const sections = [];

  // Financial transaction audit
  const financialTxns = await getAuditLogs({
    resource: 'transaction',
    action: 'COMPLETE',
    startDate,
    endDate,
    limit: 1000
  });

  sections.push({
    title: 'Financial Transactions',
    data: financialTxns,
    compliance: 'SOX Section 404 - Internal Controls'
  });

  // User access to financial systems
  const financialAccess = await getAuditLogs({
    resource: 'account',
    action: 'UPDATE',
    startDate,
    endDate,
    limit: 1000
  });

  sections.push({
    title: 'Financial System Access',
    data: financialAccess,
    compliance: 'SOX Section 302 - Corporate Responsibility'
  });

  return sections;
}

async function generateGDPRReport(startDate, endDate) {
  const sections = [];

  // Data access logs
  const dataAccess = await getAuditLogs({
    action: 'DATA_ACCESS',
    startDate,
    endDate,
    limit: 1000
  });

  sections.push({
    title: 'Personal Data Access',
    data: dataAccess,
    compliance: 'GDPR Article 30 - Records of Processing'
  });

  // Data deletion requests
  const dataDeletion = await getAuditLogs({
    action: 'DELETE',
    resource: 'user',
    startDate,
    endDate,
    limit: 1000
  });

  sections.push({
    title: 'Data Deletion Activities',
    data: dataDeletion,
    compliance: 'GDPR Article 17 - Right to Erasure'
  });

  return sections;
}

async function generatePCIDSSReport(startDate, endDate) {
  const sections = [];

  // Payment data access
  const paymentAccess = await getAuditLogs({
    resource: 'payment',
    startDate,
    endDate,
    limit: 1000
  });

  sections.push({
    title: 'Payment Data Access',
    data: paymentAccess,
    compliance: 'PCI-DSS Requirement 10 - Logging and Monitoring'
  });

  // Failed payment attempts
  const failedPayments = await getAuditLogs({
    resource: 'payment',
    action: 'FAIL',
    startDate,
    endDate,
    limit: 1000
  });

  sections.push({
    title: 'Failed Payment Attempts',
    data: failedPayments,
    compliance: 'PCI-DSS Requirement 11 - Testing Security Systems'
  });

  return sections;
}

async function bulkDeleteAuditLogs(filters) {
  try {
    const { userId, action, resource, startDate, endDate } = filters;

    let whereClause = '';
    let params = [];

    if (userId) {
      whereClause += ' AND user_id = ?';
      params.push(userId);
    }

    if (action) {
      whereClause += ' AND action = ?';
      params.push(action);
    }

    if (resource) {
      whereClause += ' AND resource = ?';
      params.push(resource);
    }

    if (startDate) {
      whereClause += ' AND timestamp >= ?';
      params.push(startDate);
    }

    if (endDate) {
      whereClause += ' AND timestamp <= ?';
      params.push(endDate);
    }

    let deletedCount = 0;

    // Delete from MySQL
    const mysqlDeleted = await connectionPool.executeWithMySQLConnection(async (connection) => {
      const [result] = await connection.execute(
        `DELETE FROM audit_logs WHERE 1=1 ${whereClause}`,
        params
      );
      return result.affectedRows;
    });
    deletedCount += mysqlDeleted;

    // Delete from MongoDB
    const mongoDB = connectionPool.getMongoDatabase();
    const query = {};

    if (userId) query.userId = userId;
    if (action) query.action = action;
    if (resource) query.resource = resource;
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    const mongoDeleted = await mongoDB.collection('audit_logs').deleteMany(query);
    deletedCount += mongoDeleted.deletedCount;

    logger.info(`Bulk deleted ${deletedCount} audit logs`);
    return deletedCount;
  } catch (error) {
    logger.error('Error bulk deleting audit logs:', error);
    throw error;
  }
}

async function reconstructAuditTrail(entityId, options) {
  try {
    const { entityType, startDate, endDate } = options;

    let whereClause = 'resource_id = ?';
    let params = [entityId];

    if (entityType) {
      whereClause += ' AND resource = ?';
      params.push(entityType);
    }

    if (startDate) {
      whereClause += ' AND timestamp >= ?';
      params.push(startDate);
    }

    if (endDate) {
      whereClause += ' AND timestamp <= ?';
      params.push(endDate);
    }

    const mysqlResult = await connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT * FROM audit_logs WHERE ${whereClause} ORDER BY timestamp ASC`,
        params
      );
      return rows;
    });

    if (mysqlResult && mysqlResult.length > 0) {
      return mysqlResult;
    }

    // Fallback to MongoDB
    const mongoDB = connectionPool.getMongoDatabase();
    const query = { resourceId: entityId };

    if (entityType) query.resource = entityType;
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    const mongoResult = await mongoDB.collection('audit_logs')
      .find(query)
      .sort({ timestamp: 1 })
      .toArray();

    return mongoResult;
  } catch (error) {
    logger.error('Error reconstructing audit trail:', error);
    throw error;
  }
}

async function createAlertRule(rule) {
  try {
    const { ruleName, conditions, webhookUrl, enabled } = rule;

    const alertRule = {
      id: uuidv4(),
      ruleName,
      conditions,
      webhookUrl,
      enabled,
      createdAt: new Date().toISOString(),
      lastTriggered: null
    };

    // Store in database (in a real implementation, you'd have an alert_rules table)
    // For now, we'll store in memory and persist to a config file
    if (!global.alertRules) {
      global.alertRules = [];
    }
    global.alertRules.push(alertRule);

    return alertRule;
  } catch (error) {
    logger.error('Error creating alert rule:', error);
    throw error;
  }
}

async function getAlertRules() {
  return global.alertRules || [];
}

async function getAlertHistory(filters) {
  try {
    const { page = 1, limit = 20, startDate, endDate } = filters;
    const offset = (page - 1) * limit;

    let dateFilter = '';
    let params = [];

    if (startDate) {
      dateFilter += ' AND triggered_at >= ?';
      params.push(startDate);
    }

    if (endDate) {
      dateFilter += ' AND triggered_at <= ?';
      params.push(endDate);
    }

    const mysqlResult = await connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT * FROM audit_alerts WHERE 1=1 ${dateFilter} ORDER BY triggered_at DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );
      return rows;
    });

    if (mysqlResult && mysqlResult.length > 0) {
      return mysqlResult;
    }

    // In a real implementation, you'd have this in MongoDB too
    return [];
  } catch (error) {
    logger.error('Error getting alert history:', error);
    throw error;
  }
}

async function archiveOldLogs(options) {
  try {
    const { archivePath, compression, retentionDays } = options;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    // Get logs to archive
    const logsToArchive = await getAuditLogs({
      endDate: cutoffDate.toISOString(),
      limit: 10000
    });

    // In a real implementation, you'd compress and store to archivePath
    // For now, just return the count
    const result = {
      archivedCount: logsToArchive.length,
      archivePath,
      compression,
      retentionDays,
      cutoffDate: cutoffDate.toISOString()
    };

    logger.info(`Archived ${logsToArchive.length} audit logs`);
    return result;
  } catch (error) {
    logger.error('Error archiving audit logs:', error);
    throw error;
  }
}

async function getAuditConfiguration() {
  // In a real implementation, this would read from a config table/file
  return {
    retentionPolicy: {
      defaultRetentionDays: 365,
      archiveAfterDays: 2555, // 7 years
      deleteAfterDays: 3650  // 10 years
    },
    alertRules: await getAlertRules(),
    enabledResources: ['user', 'account', 'transaction', 'payment', 'notification'],
    hashVerification: true,
    realTimeAlerts: true
  };
}

async function updateAuditConfiguration(updates) {
  // In a real implementation, this would update a config table/file
  const currentConfig = await getAuditConfiguration();
  const updatedConfig = { ...currentConfig, ...updates };

  // Persist changes (simplified)
  if (updates.alertRules) {
    global.alertRules = updates.alertRules;
  }

  return updatedConfig;
}

// Initialize service
async function initializeService() {
  try {
    await connectionPool.initialize();
    await kafkaService.initialize();
    await auditService.initialize();

    // Start event consumers for automatic audit logging
    const topics = Object.keys(eventConsumers);
    await kafkaService.consumeMessages(topics, 'audit-service-group', async (message) => {
      const handler = eventConsumers[message.topic];
      if (handler) {
        await handler(message);
      }
    });

    logger.info(`Audit Service started on port ${PORT}`);
  } catch (error) {
    logger.error('Failed to initialize Audit Service:', error);
    process.exit(1);
  }
}

app.listen(PORT, () => {
  initializeService();
});

export default app;