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