import { v4 as uuidv4 } from 'uuid';

export class LogAuditEventCommand {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.userId = data.userId;
    this.action = data.action;
    this.resource = data.resource;
    this.resourceId = data.resourceId;
    this.details = data.details || {};
    this.ipAddress = data.ipAddress;
    this.userAgent = data.userAgent;
    this.sessionId = data.sessionId;
    this.location = data.location;
    this.deviceInfo = data.deviceInfo || {};
    this.riskScore = data.riskScore || 0;
    this.complianceFlags = data.complianceFlags || [];
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
  }

  validate() {
    if (!this.userId) {
      throw new Error('User ID is required');
    }
    if (!this.action) {
      throw new Error('Action is required');
    }
    if (!this.resource) {
      throw new Error('Resource is required');
    }

    const validActions = [
      'LOGIN', 'LOGOUT', 'CREATE', 'READ', 'UPDATE', 'DELETE',
      'EXPORT', 'IMPORT', 'APPROVE', 'REJECT', 'TRANSFER',
      'PASSWORD_CHANGE', 'PERMISSION_CHANGE', 'ROLE_CHANGE',
      'ACCOUNT_LOCK', 'ACCOUNT_UNLOCK', 'SESSION_START', 'SESSION_END',
      'API_ACCESS', 'DATA_ACCESS', 'CONFIG_CHANGE', 'SECURITY_ALERT'
    ];

    if (!validActions.includes(this.action)) {
      throw new Error(`Invalid action: ${this.action}`);
    }
  }
}

export class BulkLogAuditEventsCommand {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.events = data.events || [];
    this.batchId = data.batchId || uuidv4();
    this.source = data.source || 'system';
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
  }

  validate() {
    if (!Array.isArray(this.events) || this.events.length === 0) {
      throw new Error('Events array is required and cannot be empty');
    }

    if (this.events.length > 1000) {
      throw new Error('Maximum 1000 events per batch');
    }

    this.events.forEach((event, index) => {
      if (!event.userId || !event.action || !event.resource) {
        throw new Error(`Invalid event at index ${index}: userId, action, and resource are required`);
      }
    });
  }
}

export class ArchiveAuditLogsCommand {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.criteria = data.criteria || {};
    this.archiveTo = data.archiveTo || 'cold_storage';
    this.retentionPeriod = data.retentionPeriod || 2555; // days
    this.compression = data.compression || 'gzip';
    this.encryption = data.encryption || 'aes256';
    this.requestedBy = data.requestedBy;
    this.reason = data.reason;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
  }

  validate() {
    if (!this.requestedBy) {
      throw new Error('Requested by is required');
    }
    if (!this.reason) {
      throw new Error('Reason for archiving is required');
    }

    const validArchives = ['cold_storage', 'external_backup', 'compliance_vault'];
    if (!validArchives.includes(this.archiveTo)) {
      throw new Error(`Invalid archive destination: ${this.archiveTo}`);
    }
  }
}

export class PurgeAuditLogsCommand {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.criteria = data.criteria || {};
    this.olderThan = data.olderThan; // ISO date string
    this.forceDelete = data.forceDelete || false;
    this.backupFirst = data.backupFirst || true;
    this.approvedBy = data.approvedBy;
    this.complianceApproval = data.complianceApproval;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
  }

  validate() {
    if (!this.olderThan) {
      throw new Error('Older than date is required');
    }
    if (!this.approvedBy) {
      throw new Error('Approval authority is required');
    }

    const olderThanDate = new Date(this.olderThan);
    if (isNaN(olderThanDate.getTime())) {
      throw new Error('Invalid older than date format');
    }

    // Must be at least 7 years old for compliance
    const sevenYearsAgo = new Date();
    sevenYearsAgo.setFullYear(sevenYearsAgo.getFullYear() - 7);
    if (olderThanDate > sevenYearsAgo) {
      throw new Error('Cannot purge logs less than 7 years old without special approval');
    }
  }
}

export class FlagSuspiciousActivityCommand {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.auditLogId = data.auditLogId;
    this.userId = data.userId;
    this.activityType = data.activityType;
    this.severity = data.severity || 'medium';
    this.indicators = data.indicators || [];
    this.riskScore = data.riskScore || 0;
    this.automaticAction = data.automaticAction;
    this.requiresReview = data.requiresReview || true;
    this.escalationLevel = data.escalationLevel || 1;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
  }

  validate() {
    if (!this.auditLogId && !this.userId) {
      throw new Error('Either audit log ID or user ID is required');
    }
    if (!this.activityType) {
      throw new Error('Activity type is required');
    }

    const validSeverities = ['low', 'medium', 'high', 'critical'];
    if (!validSeverities.includes(this.severity)) {
      throw new Error(`Invalid severity: ${this.severity}`);
    }

    const validActivities = [
      'unusual_login_time', 'multiple_failed_logins', 'unusual_location',
      'suspicious_ip', 'bulk_data_access', 'privilege_escalation',
      'unusual_transaction_pattern', 'account_enumeration', 'brute_force_attempt'
    ];

    if (!validActivities.includes(this.activityType)) {
      throw new Error(`Invalid activity type: ${this.activityType}`);
    }
  }
}

export class GenerateAuditReportCommand {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.reportType = data.reportType;
    this.parameters = data.parameters || {};
    this.filters = data.filters || {};
    this.format = data.format || 'json';
    this.includeCompliance = data.includeCompliance || true;
    this.includeRiskAnalysis = data.includeRiskAnalysis || false;
    this.timeRange = data.timeRange || {};
    this.generatedBy = data.generatedBy;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
  }

  validate() {
    if (!this.reportType) {
      throw new Error('Report type is required');
    }
    if (!this.generatedBy) {
      throw new Error('Generated by is required');
    }

    const validTypes = [
      'access-audit', 'security-incidents', 'compliance-report',
      'user-activity-summary', 'system-changes', 'data-access-log',
      'failed-authentication', 'privilege-changes', 'custom-audit'
    ];

    if (!validTypes.includes(this.reportType)) {
      throw new Error(`Invalid report type: ${this.reportType}`);
    }

    const validFormats = ['json', 'csv', 'pdf', 'xlsx', 'xml'];
    if (!validFormats.includes(this.format)) {
      throw new Error(`Invalid format: ${this.format}`);
    }
  }
}

export class UpdateAuditRetentionPolicyCommand {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.policyId = data.policyId || uuidv4();
    this.name = data.name;
    this.description = data.description;
    this.retentionRules = data.retentionRules || [];
    this.complianceRequirements = data.complianceRequirements || [];
    this.autoArchive = data.autoArchive || true;
    this.autoPurge = data.autoPurge || false;
    this.notificationSettings = data.notificationSettings || {};
    this.approvedBy = data.approvedBy;
    this.effectiveDate = data.effectiveDate || new Date().toISOString();
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
  }

  validate() {
    if (!this.name) {
      throw new Error('Policy name is required');
    }
    if (!this.approvedBy) {
      throw new Error('Approval authority is required');
    }
    if (!Array.isArray(this.retentionRules) || this.retentionRules.length === 0) {
      throw new Error('Retention rules are required');
    }

    this.retentionRules.forEach((rule, index) => {
      if (!rule.category || !rule.retentionDays) {
        throw new Error(`Invalid retention rule at index ${index}`);
      }
    });
  }
}