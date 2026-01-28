export class GetAuditLogsQuery {
  constructor(data) {
    this.userId = data.userId;
    this.action = data.action;
    this.resource = data.resource;
    this.resourceId = data.resourceId;
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.ipAddress = data.ipAddress;
    this.sessionId = data.sessionId;
    this.riskScore = data.riskScore;
    this.complianceFlags = data.complianceFlags;
    this.page = data.page || 1;
    this.limit = data.limit || 50;
    this.sortBy = data.sortBy || 'timestamp';
    this.sortOrder = data.sortOrder || 'desc';
    this.includeDetails = data.includeDetails !== false;
    this.filters = data.filters || {};
  }

  validate() {
    if (this.page < 1) {
      throw new Error('Page must be greater than 0');
    }
    if (this.limit < 1 || this.limit > 1000) {
      throw new Error('Limit must be between 1 and 1000');
    }

    const validSortFields = ['timestamp', 'userId', 'action', 'resource', 'riskScore'];
    if (!validSortFields.includes(this.sortBy)) {
      throw new Error(`Invalid sort field: ${this.sortBy}`);
    }

    if (!['asc', 'desc'].includes(this.sortOrder)) {
      throw new Error('Sort order must be asc or desc');
    }

    if (this.startDate && this.endDate) {
      const start = new Date(this.startDate);
      const end = new Date(this.endDate);
      if (start > end) {
        throw new Error('Start date cannot be after end date');
      }
    }
  }
}

export class GetAuditLogByIdQuery {
  constructor(data) {
    this.id = data.id;
    this.includeDetails = data.includeDetails !== false;
    this.includeRelated = data.includeRelated || false;
  }

  validate() {
    if (!this.id) {
      throw new Error('Audit log ID is required');
    }
  }
}

export class GetUserAuditTrailQuery {
  constructor(data) {
    this.userId = data.userId;
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.actions = data.actions; // array of actions to filter
    this.resources = data.resources; // array of resources to filter
    this.page = data.page || 1;
    this.limit = data.limit || 100;
    this.includeSessionInfo = data.includeSessionInfo || false;
    this.includeRiskAnalysis = data.includeRiskAnalysis || false;
  }

  validate() {
    if (!this.userId) {
      throw new Error('User ID is required');
    }

    if (this.startDate && this.endDate) {
      const start = new Date(this.startDate);
      const end = new Date(this.endDate);
      if (start > end) {
        throw new Error('Start date cannot be after end date');
      }
    }

    if (this.actions && !Array.isArray(this.actions)) {
      throw new Error('Actions must be an array');
    }

    if (this.resources && !Array.isArray(this.resources)) {
      throw new Error('Resources must be an array');
    }
  }
}

export class GetResourceAuditTrailQuery {
  constructor(data) {
    this.resource = data.resource;
    this.resourceId = data.resourceId;
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.actions = data.actions;
    this.userIds = data.userIds;
    this.page = data.page || 1;
    this.limit = data.limit || 100;
    this.includeUserDetails = data.includeUserDetails || false;
  }

  validate() {
    if (!this.resource) {
      throw new Error('Resource type is required');
    }

    if (this.startDate && this.endDate) {
      const start = new Date(this.startDate);
      const end = new Date(this.endDate);
      if (start > end) {
        throw new Error('Start date cannot be after end date');
      }
    }
  }
}

export class GetAuditStatisticsQuery {
  constructor(data) {
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.groupBy = data.groupBy || 'day'; // day, week, month, hour
    this.metrics = data.metrics || ['total_events', 'unique_users', 'risk_distribution'];
    this.filters = data.filters || {};
    this.includeTrends = data.includeTrends || false;
  }

  validate() {
    if (this.startDate && this.endDate) {
      const start = new Date(this.startDate);
      const end = new Date(this.endDate);
      if (start > end) {
        throw new Error('Start date cannot be after end date');
      }
    }

    const validGroupBy = ['hour', 'day', 'week', 'month'];
    if (!validGroupBy.includes(this.groupBy)) {
      throw new Error(`Invalid group by: ${this.groupBy}`);
    }

    const validMetrics = [
      'total_events', 'unique_users', 'risk_distribution',
      'action_breakdown', 'resource_access', 'geographic_distribution',
      'time_patterns', 'compliance_flags'
    ];

    if (this.metrics.some(metric => !validMetrics.includes(metric))) {
      throw new Error('Invalid metric specified');
    }
  }
}

export class GetSuspiciousActivitiesQuery {
  constructor(data) {
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.severity = data.severity; // low, medium, high, critical
    this.activityTypes = data.activityTypes; // array of activity types
    this.minRiskScore = data.minRiskScore || 0;
    this.maxRiskScore = data.maxRiskScore || 100;
    this.status = data.status || 'open'; // open, investigating, resolved, false_positive
    this.assignedTo = data.assignedTo;
    this.page = data.page || 1;
    this.limit = data.limit || 50;
    this.includeAuditLogs = data.includeAuditLogs || false;
  }

  validate() {
    if (this.startDate && this.endDate) {
      const start = new Date(this.startDate);
      const end = new Date(this.endDate);
      if (start > end) {
        throw new Error('Start date cannot be after end date');
      }
    }

    const validSeverities = ['low', 'medium', 'high', 'critical'];
    if (this.severity && !validSeverities.includes(this.severity)) {
      throw new Error(`Invalid severity: ${this.severity}`);
    }

    const validStatuses = ['open', 'investigating', 'resolved', 'false_positive'];
    if (!validStatuses.includes(this.status)) {
      throw new Error(`Invalid status: ${this.status}`);
    }

    if (this.minRiskScore < 0 || this.minRiskScore > 100) {
      throw new Error('Risk score must be between 0 and 100');
    }

    if (this.maxRiskScore < 0 || this.maxRiskScore > 100) {
      throw new Error('Risk score must be between 0 and 100');
    }

    if (this.minRiskScore > this.maxRiskScore) {
      throw new Error('Min risk score cannot be greater than max risk score');
    }
  }
}

export class GetComplianceReportQuery {
  constructor(data) {
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.complianceStandards = data.complianceStandards || ['SOX', 'GDPR', 'PCI-DSS', 'HIPAA'];
    this.reportType = data.reportType || 'summary'; // summary, detailed, executive
    this.includeRecommendations = data.includeRecommendations || true;
    this.includeEvidence = data.includeEvidence || false;
    this.format = data.format || 'json';
  }

  validate() {
    if (!this.startDate || !this.endDate) {
      throw new Error('Start date and end date are required');
    }

    const start = new Date(this.startDate);
    const end = new Date(this.endDate);
    if (start > end) {
      throw new Error('Start date cannot be after end date');
    }

    const validStandards = ['SOX', 'GDPR', 'PCI-DSS', 'HIPAA', 'ISO27001', 'NIST'];
    if (this.complianceStandards.some(std => !validStandards.includes(std))) {
      throw new Error('Invalid compliance standard specified');
    }

    const validTypes = ['summary', 'detailed', 'executive'];
    if (!validTypes.includes(this.reportType)) {
      throw new Error(`Invalid report type: ${this.reportType}`);
    }

    const validFormats = ['json', 'pdf', 'html'];
    if (!validFormats.includes(this.format)) {
      throw new Error(`Invalid format: ${this.format}`);
    }
  }
}

export class GetAuditRetentionStatusQuery {
  constructor(data) {
    this.category = data.category;
    this.olderThan = data.olderThan;
    this.includeArchived = data.includeArchived || false;
    this.includePurged = data.includePurged || false;
    this.page = data.page || 1;
    this.limit = data.limit || 100;
  }

  validate() {
    if (this.olderThan) {
      const date = new Date(this.olderThan);
      if (isNaN(date.getTime())) {
        throw new Error('Invalid older than date format');
      }
    }
  }
}

export class GetSystemAccessLogQuery {
  constructor(data) {
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.systemComponent = data.systemComponent;
    this.accessType = data.accessType; // read, write, admin, maintenance
    this.userId = data.userId;
    this.ipAddress = data.ipAddress;
    this.includeFailedAccess = data.includeFailedAccess || true;
    this.page = data.page || 1;
    this.limit = data.limit || 100;
  }

  validate() {
    if (!this.startDate || !this.endDate) {
      throw new Error('Start date and end date are required');
    }

    const start = new Date(this.startDate);
    const end = new Date(this.endDate);
    if (start > end) {
      throw new Error('Start date cannot be after end date');
    }

    const validAccessTypes = ['read', 'write', 'admin', 'maintenance', 'api'];
    if (this.accessType && !validAccessTypes.includes(this.accessType)) {
      throw new Error(`Invalid access type: ${this.accessType}`);
    }
  }
}

export class GetDataAccessAuditQuery {
  constructor(data) {
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.dataType = data.dataType; // PII, financial, medical, etc.
    this.accessReason = data.accessReason;
    this.userId = data.userId;
    this.justificationRequired = data.justificationRequired;
    this.includeUnauthorized = data.includeUnauthorized || true;
    this.page = data.page || 1;
    this.limit = data.limit || 100;
  }

  validate() {
    if (!this.startDate || !this.endDate) {
      throw new Error('Start date and end date are required');
    }

    const start = new Date(this.startDate);
    const end = new Date(this.endDate);
    if (start > end) {
      throw new Error('Start date cannot be after end date');
    }

    const validDataTypes = ['PII', 'financial', 'medical', 'system', 'user', 'transaction'];
    if (this.dataType && !validDataTypes.includes(this.dataType)) {
      throw new Error(`Invalid data type: ${this.dataType}`);
    }
  }
}