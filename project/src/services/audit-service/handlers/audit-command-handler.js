import { v4 as uuidv4 } from 'uuid';
import {
  LogAuditEventCommand,
  BulkLogAuditEventsCommand,
  ArchiveAuditLogsCommand,
  PurgeAuditLogsCommand,
  FlagSuspiciousActivityCommand,
  GenerateAuditReportCommand,
  UpdateAuditRetentionPolicyCommand
} from '../commands/audit-commands.js';

import {
  AuditEventLoggedEvent,
  BulkAuditEventsLoggedEvent,
  AuditLogsArchivedEvent,
  AuditLogsPurgedEvent,
  SuspiciousActivityFlaggedEvent,
  AuditReportGeneratedEvent,
  AuditRetentionPolicyUpdatedEvent
} from '../events/audit-events.js';

export class AuditCommandHandler {
  constructor(dependencies) {
    this.connectionPool = dependencies.connectionPool;
    this.dualWriter = dependencies.dualWriter;
    this.eventStore = dependencies.eventStore;
    this.kafkaService = dependencies.kafkaService;
    this.logger = dependencies.logger;
    this.cache = new Map();
  }

  async handle(command) {
    try {
      command.validate();

      switch (command.constructor.name) {
        case 'LogAuditEventCommand':
          return await this.handleLogAuditEvent(command);
        case 'BulkLogAuditEventsCommand':
          return await this.handleBulkLogAuditEvents(command);
        case 'ArchiveAuditLogsCommand':
          return await this.handleArchiveAuditLogs(command);
        case 'PurgeAuditLogsCommand':
          return await this.handlePurgeAuditLogs(command);
        case 'FlagSuspiciousActivityCommand':
          return await this.handleFlagSuspiciousActivity(command);
        case 'GenerateAuditReportCommand':
          return await this.handleGenerateAuditReport(command);
        case 'UpdateAuditRetentionPolicyCommand':
          return await this.handleUpdateAuditRetentionPolicy(command);
        default:
          throw new Error(`Unknown command: ${command.constructor.name}`);
      }
    } catch (error) {
      this.logger.error(`Error handling command ${command.constructor.name}:`, error);
      throw error;
    }
  }

  async handleLogAuditEvent(command) {
    const auditLog = {
      id: command.id,
      userId: command.userId,
      action: command.action,
      resource: command.resource,
      resourceId: command.resourceId,
      details: JSON.stringify(command.details),
      ipAddress: command.ipAddress,
      userAgent: command.userAgent,
      sessionId: command.sessionId,
      location: command.location,
      deviceInfo: JSON.stringify(command.deviceInfo),
      riskScore: command.riskScore,
      complianceFlags: JSON.stringify(command.complianceFlags),
      metadata: JSON.stringify(command.metadata),
      timestamp: command.timestamp
    };

    // Write to both databases
    await this.dualWriter.write('audit_logs', auditLog);

    // Publish event
    const event = new AuditEventLoggedEvent({
      auditLogId: command.id,
      userId: command.userId,
      action: command.action,
      resource: command.resource,
      resourceId: command.resourceId,
      details: command.details,
      ipAddress: command.ipAddress,
      userAgent: command.userAgent,
      sessionId: command.sessionId,
      location: command.location,
      deviceInfo: command.deviceInfo,
      riskScore: command.riskScore,
      complianceFlags: command.complianceFlags,
      metadata: command.metadata,
      timestamp: command.timestamp
    });

    await this.eventStore.saveEvent(event);
    await this.kafkaService.publishMessage('audit-events', event);

    this.logger.info(`Audit event logged: ${command.action} on ${command.resource}`, {
      auditLogId: command.id,
      userId: command.userId
    });

    return { auditLogId: command.id };
  }

  async handleBulkLogAuditEvents(command) {
    const startTime = Date.now();
    const auditLogs = command.events.map(event => ({
      id: event.id || uuidv4(),
      userId: event.userId,
      action: event.action,
      resource: event.resource,
      resourceId: event.resourceId,
      details: JSON.stringify(event.details || {}),
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      sessionId: event.sessionId,
      location: event.location,
      deviceInfo: JSON.stringify(event.deviceInfo || {}),
      riskScore: event.riskScore || 0,
      complianceFlags: JSON.stringify(event.complianceFlags || []),
      metadata: JSON.stringify(event.metadata || {}),
      timestamp: event.timestamp || new Date().toISOString()
    }));

    // Bulk write to databases
    await this.dualWriter.bulkWrite('audit_logs', auditLogs);

    const processingTime = Date.now() - startTime;

    // Publish event
    const event = new BulkAuditEventsLoggedEvent({
      batchId: command.batchId,
      eventCount: auditLogs.length,
      events: auditLogs.map(log => ({ id: log.id, userId: log.userId, action: log.action })),
      source: command.source,
      processingTime,
      metadata: command.metadata,
      timestamp: command.timestamp
    });

    await this.eventStore.saveEvent(event);
    await this.kafkaService.publishMessage('audit-events', event);

    this.logger.info(`Bulk audit events logged: ${auditLogs.length} events in ${processingTime}ms`);

    return {
      batchId: command.batchId,
      eventCount: auditLogs.length,
      processingTime
    };
  }

  async handleArchiveAuditLogs(command) {
    // Build archive criteria
    const criteria = this.buildArchiveCriteria(command.criteria);

    // Get records to archive
    const records = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT * FROM audit_logs WHERE ${criteria.whereClause}`,
        criteria.params
      );
      return rows;
    });

    if (records.length === 0) {
      throw new Error('No records found matching archive criteria');
    }

    // Create archive
    const archiveId = `archive_${Date.now()}_${command.id}`;
    const archiveData = {
      id: archiveId,
      criteria: command.criteria,
      recordCount: records.length,
      archiveTo: command.archiveTo,
      compression: command.compression,
      encryption: command.encryption,
      createdBy: command.requestedBy,
      reason: command.reason,
      metadata: command.metadata,
      createdAt: new Date().toISOString()
    };

    // Store archive metadata
    await this.dualWriter.write('audit_archives', archiveData);

    // Mark records as archived
    await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      await connection.execute(
        `UPDATE audit_logs SET archived = 1, archive_id = ?, archived_at = ?
         WHERE ${criteria.whereClause}`,
        [archiveId, new Date().toISOString(), ...criteria.params]
      );
    });

    // Publish event
    const event = new AuditLogsArchivedEvent({
      archiveId,
      criteria: command.criteria,
      recordCount: records.length,
      archiveTo: command.archiveTo,
      compression: command.compression,
      encryption: command.encryption,
      requestedBy: command.requestedBy,
      reason: command.reason,
      metadata: command.metadata
    });

    await this.eventStore.saveEvent(event);
    await this.kafkaService.publishMessage('audit-events', event);

    this.logger.info(`Audit logs archived: ${records.length} records to ${command.archiveTo}`);

    return {
      archiveId,
      recordCount: records.length,
      archiveTo: command.archiveTo
    };
  }

  async handlePurgeAuditLogs(command) {
    // Build purge criteria
    const criteria = this.buildPurgeCriteria(command.criteria, command.olderThan);

    // Create backup if requested
    let backupId = null;
    if (command.backupFirst) {
      backupId = await this.createBackup(criteria);
    }

    // Get records to purge
    const records = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT COUNT(*) as count FROM audit_logs WHERE ${criteria.whereClause}`,
        criteria.params
      );
      return rows[0].count;
    });

    if (records === 0) {
      throw new Error('No records found matching purge criteria');
    }

    // Purge records
    const purgeId = `purge_${Date.now()}_${command.id}`;
    await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      await connection.execute(
        `DELETE FROM audit_logs WHERE ${criteria.whereClause}`,
        criteria.params
      );
    });

    // Log purge operation
    const purgeLog = {
      id: purgeId,
      criteria: command.criteria,
      recordCount: records,
      olderThan: command.olderThan,
      backupCreated: !!backupId,
      approvedBy: command.approvedBy,
      complianceApproval: command.complianceApproval,
      metadata: command.metadata,
      timestamp: command.timestamp
    };

    await this.dualWriter.write('audit_purges', purgeLog);

    // Publish event
    const event = new AuditLogsPurgedEvent({
      purgeId,
      criteria: command.criteria,
      recordCount: records,
      olderThan: command.olderThan,
      backupCreated: !!backupId,
      approvedBy: command.approvedBy,
      complianceApproval: command.complianceApproval,
      metadata: command.metadata
    });

    await this.eventStore.saveEvent(event);
    await this.kafkaService.publishMessage('audit-events', event);

    this.logger.info(`Audit logs purged: ${records} records older than ${command.olderThan}`);

    return {
      purgeId,
      recordCount: records,
      backupId
    };
  }

  async handleFlagSuspiciousActivity(command) {
    const flagData = {
      id: command.id,
      auditLogId: command.auditLogId,
      userId: command.userId,
      activityType: command.activityType,
      severity: command.severity,
      indicators: JSON.stringify(command.indicators),
      riskScore: command.riskScore,
      automaticAction: command.automaticAction,
      requiresReview: command.requiresReview,
      escalationLevel: command.escalationLevel,
      status: 'open',
      metadata: JSON.stringify(command.metadata),
      timestamp: command.timestamp
    };

    await this.dualWriter.write('suspicious_activities', flagData);

    // Publish event
    const event = new SuspiciousActivityFlaggedEvent({
      flagId: command.id,
      auditLogId: command.auditLogId,
      userId: command.userId,
      activityType: command.activityType,
      severity: command.severity,
      indicators: command.indicators,
      riskScore: command.riskScore,
      automaticAction: command.automaticAction,
      requiresReview: command.requiresReview,
      escalationLevel: command.escalationLevel,
      metadata: command.metadata
    });

    await this.eventStore.saveEvent(event);
    await this.kafkaService.publishMessage('audit-events', event);

    this.logger.info(`Suspicious activity flagged: ${command.activityType} for user ${command.userId}`);

    return { flagId: command.id };
  }

  async handleGenerateAuditReport(command) {
    // Generate report based on type
    const reportData = await this.generateReportData(command);

    const report = {
      id: command.id,
      reportType: command.reportType,
      parameters: JSON.stringify(command.parameters),
      filters: JSON.stringify(command.filters),
      format: command.format,
      recordCount: reportData.recordCount,
      fileSize: reportData.fileSize,
      generationTime: reportData.generationTime,
      generatedBy: command.generatedBy,
      downloadUrl: reportData.downloadUrl,
      metadata: JSON.stringify(command.metadata),
      timestamp: command.timestamp
    };

    await this.dualWriter.write('audit_reports', report);

    // Publish event
    const event = new AuditReportGeneratedEvent({
      reportId: command.id,
      reportType: command.reportType,
      parameters: command.parameters,
      filters: command.filters,
      format: command.format,
      recordCount: reportData.recordCount,
      fileSize: reportData.fileSize,
      generationTime: reportData.generationTime,
      generatedBy: command.generatedBy,
      downloadUrl: reportData.downloadUrl,
      metadata: command.metadata
    });

    await this.eventStore.saveEvent(event);
    await this.kafkaService.publishMessage('audit-events', event);

    this.logger.info(`Audit report generated: ${command.reportType} with ${reportData.recordCount} records`);

    return {
      reportId: command.id,
      recordCount: reportData.recordCount,
      downloadUrl: reportData.downloadUrl
    };
  }

  async handleUpdateAuditRetentionPolicy(command) {
    const policyData = {
      id: command.policyId,
      name: command.name,
      description: command.description,
      retentionRules: JSON.stringify(command.retentionRules),
      complianceRequirements: JSON.stringify(command.complianceRequirements),
      autoArchive: command.autoArchive,
      autoPurge: command.autoPurge,
      notificationSettings: JSON.stringify(command.notificationSettings),
      approvedBy: command.approvedBy,
      effectiveDate: command.effectiveDate,
      metadata: JSON.stringify(command.metadata),
      timestamp: command.timestamp
    };

    await this.dualWriter.write('audit_retention_policies', policyData);

    // Update cache
    this.cache.set(`policy_${command.policyId}`, policyData);

    // Publish event
    const event = new AuditRetentionPolicyUpdatedEvent({
      policyId: command.policyId,
      name: command.name,
      description: command.description,
      retentionRules: command.retentionRules,
      complianceRequirements: command.complianceRequirements,
      autoArchive: command.autoArchive,
      autoPurge: command.autoPurge,
      notificationSettings: command.notificationSettings,
      approvedBy: command.approvedBy,
      effectiveDate: command.effectiveDate,
      metadata: command.metadata
    });

    await this.eventStore.saveEvent(event);
    await this.kafkaService.publishMessage('audit-events', event);

    this.logger.info(`Audit retention policy updated: ${command.name}`);

    return { policyId: command.policyId };
  }

  buildArchiveCriteria(criteria) {
    const conditions = [];
    const params = [];

    if (criteria.userId) {
      conditions.push('user_id = ?');
      params.push(criteria.userId);
    }

    if (criteria.startDate) {
      conditions.push('timestamp >= ?');
      params.push(criteria.startDate);
    }

    if (criteria.endDate) {
      conditions.push('timestamp <= ?');
      params.push(criteria.endDate);
    }

    if (criteria.resource) {
      conditions.push('resource = ?');
      params.push(criteria.resource);
    }

    return {
      whereClause: conditions.length > 0 ? conditions.join(' AND ') : '1=1',
      params
    };
  }

  buildPurgeCriteria(criteria, olderThan) {
    const conditions = ['archived = 1'];
    const params = [];

    if (olderThan) {
      conditions.push('timestamp < ?');
      params.push(olderThan);
    }

    if (criteria.userId) {
      conditions.push('user_id = ?');
      params.push(criteria.userId);
    }

    if (criteria.resource) {
      conditions.push('resource = ?');
      params.push(criteria.resource);
    }

    return {
      whereClause: conditions.join(' AND '),
      params
    };
  }

  async createBackup(criteria) {
    const backupId = `backup_${Date.now()}`;
    // Implementation for creating backup would go here
    // This is a placeholder for the actual backup logic
    return backupId;
  }

  async generateReportData(command) {
    // Placeholder for report generation logic
    // This would implement the actual report generation based on command.reportType
    return {
      recordCount: 0,
      fileSize: 0,
      generationTime: 0,
      downloadUrl: `/reports/${command.id}`
    };
  }
}