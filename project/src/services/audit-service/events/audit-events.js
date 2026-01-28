import { v4 as uuidv4 } from 'uuid';

export class AuditEventLoggedEvent {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.auditLogId = data.auditLogId;
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
    this.eventType = 'AUDIT_EVENT_LOGGED';
    this.version = 1;
  }
}

export class BulkAuditEventsLoggedEvent {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.batchId = data.batchId;
    this.eventCount = data.eventCount;
    this.events = data.events || [];
    this.source = data.source || 'system';
    this.processingTime = data.processingTime;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventType = 'BULK_AUDIT_EVENTS_LOGGED';
    this.version = 1;
  }
}

export class AuditLogsArchivedEvent {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.archiveId = data.archiveId;
    this.criteria = data.criteria || {};
    this.recordCount = data.recordCount;
    this.archiveTo = data.archiveTo;
    this.compression = data.compression;
    this.encryption = data.encryption;
    this.archiveSize = data.archiveSize;
    this.checksum = data.checksum;
    this.requestedBy = data.requestedBy;
    this.reason = data.reason;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventType = 'AUDIT_LOGS_ARCHIVED';
    this.version = 1;
  }
}

export class AuditLogsPurgedEvent {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.purgeId = data.purgeId;
    this.criteria = data.criteria || {};
    this.recordCount = data.recordCount;
    this.olderThan = data.olderThan;
    this.backupCreated = data.backupCreated;
    this.approvedBy = data.approvedBy;
    this.complianceApproval = data.complianceApproval;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventType = 'AUDIT_LOGS_PURGED';
    this.version = 1;
  }
}

export class SuspiciousActivityFlaggedEvent {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.flagId = data.flagId;
    this.auditLogId = data.auditLogId;
    this.userId = data.userId;
    this.activityType = data.activityType;
    this.severity = data.severity;
    this.indicators = data.indicators || [];
    this.riskScore = data.riskScore || 0;
    this.automaticAction = data.automaticAction;
    this.requiresReview = data.requiresReview;
    this.escalationLevel = data.escalationLevel;
    this.assignedTo = data.assignedTo;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventType = 'SUSPICIOUS_ACTIVITY_FLAGGED';
    this.version = 1;
  }
}

export class AuditReportGeneratedEvent {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.reportId = data.reportId;
    this.reportType = data.reportType;
    this.parameters = data.parameters || {};
    this.filters = data.filters || {};
    this.format = data.format;
    this.recordCount = data.recordCount;
    this.fileSize = data.fileSize;
    this.generationTime = data.generationTime;
    this.generatedBy = data.generatedBy;
    this.downloadUrl = data.downloadUrl;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventType = 'AUDIT_REPORT_GENERATED';
    this.version = 1;
  }
}

export class AuditRetentionPolicyUpdatedEvent {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.policyId = data.policyId;
    this.name = data.name;
    this.description = data.description;
    this.retentionRules = data.retentionRules || [];
    this.complianceRequirements = data.complianceRequirements || [];
    this.autoArchive = data.autoArchive;
    this.autoPurge = data.autoPurge;
    this.notificationSettings = data.notificationSettings || {};
    this.approvedBy = data.approvedBy;
    this.effectiveDate = data.effectiveDate;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventType = 'AUDIT_RETENTION_POLICY_UPDATED';
    this.version = 1;
  }
}

export class AuditComplianceAlertEvent {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.alertId = data.alertId;
    this.alertType = data.alertType;
    this.severity = data.severity;
    this.description = data.description;
    this.affectedRecords = data.affectedRecords || 0;
    this.complianceStandard = data.complianceStandard;
    this.requiredAction = data.requiredAction;
    this.deadline = data.deadline;
    this.assignedTo = data.assignedTo;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventType = 'AUDIT_COMPLIANCE_ALERT';
    this.version = 1;
  }
}

export class AuditDataIntegrityCheckEvent {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.checkId = data.checkId;
    this.checkType = data.checkType;
    this.recordsChecked = data.recordsChecked;
    this.issuesFound = data.issuesFound || [];
    this.integrityScore = data.integrityScore;
    this.lastKnownGoodState = data.lastKnownGoodState;
    this.recommendations = data.recommendations || [];
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventType = 'AUDIT_DATA_INTEGRITY_CHECK';
    this.version = 1;
  }
}

export class AuditAccessReviewEvent {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.reviewId = data.reviewId;
    this.userId = data.userId;
    this.reviewerId = data.reviewerId;
    this.accessLevel = data.accessLevel;
    this.lastAccess = data.lastAccess;
    this.recommendation = data.recommendation;
    this.justification = data.justification;
    this.approved = data.approved;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventType = 'AUDIT_ACCESS_REVIEW';
    this.version = 1;
  }
}

export class AuditSystemHealthEvent {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.healthCheckId = data.healthCheckId;
    this.component = data.component;
    this.status = data.status;
    this.metrics = data.metrics || {};
    this.issues = data.issues || [];
    this.recommendations = data.recommendations || [];
    this.nextCheckScheduled = data.nextCheckScheduled;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventType = 'AUDIT_SYSTEM_HEALTH';
    this.version = 1;
  }
}