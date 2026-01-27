import { v4 as uuidv4 } from 'uuid';

export class GenerateReportCommand {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.reportType = data.reportType;
    this.parameters = data.parameters || {};
    this.format = data.format || 'json';
    this.userId = data.userId;
    this.requestedAt = data.requestedAt || new Date().toISOString();
    this.metadata = data.metadata || {};
  }

  validate() {
    if (!this.reportType) {
      throw new Error('Report type is required');
    }

    const validTypes = [
      'transaction-summary',
      'financial-statement',
      'compliance-audit',
      'user-activity',
      'performance-metrics',
      'risk-analysis',
      'revenue-analytics',
      'customer-insights',
      'operational-dashboard',
      'custom-report'
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

export class ScheduleReportCommand {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.name = data.name;
    this.reportType = data.reportType;
    this.schedule = data.schedule; // cron expression
    this.parameters = data.parameters || {};
    this.format = data.format || 'json';
    this.recipients = data.recipients || [];
    this.deliveryMethod = data.deliveryMethod || 'email'; // email, webhook, sftp
    this.isActive = data.isActive !== undefined ? data.isActive : true;
    this.createdBy = data.createdBy;
    this.metadata = data.metadata || {};
    this.createdAt = data.createdAt || new Date().toISOString();
  }

  validate() {
    if (!this.name || !this.reportType || !this.schedule) {
      throw new Error('Name, report type, and schedule are required');
    }

    if (!this.recipients || this.recipients.length === 0) {
      throw new Error('At least one recipient is required');
    }

    const validDeliveryMethods = ['email', 'webhook', 'sftp', 'api'];
    if (!validDeliveryMethods.includes(this.deliveryMethod)) {
      throw new Error(`Invalid delivery method: ${this.deliveryMethod}`);
    }
  }
}

export class UpdateScheduledReportCommand {
  constructor(data) {
    this.id = data.id;
    this.updates = data.updates || {};
    this.updatedBy = data.updatedBy;
    this.updatedAt = data.updatedAt || new Date().toISOString();
  }

  validate() {
    if (!this.id) {
      throw new Error('Report ID is required');
    }

    const allowedUpdates = [
      'name', 'schedule', 'parameters', 'format', 'recipients',
      'deliveryMethod', 'isActive', 'metadata'
    ];

    const invalidUpdates = Object.keys(this.updates).filter(
      key => !allowedUpdates.includes(key)
    );

    if (invalidUpdates.length > 0) {
      throw new Error(`Invalid update fields: ${invalidUpdates.join(', ')}`);
    }
  }
}

export class DeleteScheduledReportCommand {
  constructor(data) {
    this.id = data.id;
    this.deletedBy = data.deletedBy;
    this.deletedAt = data.deletedAt || new Date().toISOString();
  }

  validate() {
    if (!this.id) {
      throw new Error('Report ID is required');
    }
  }
}

export class CreateReportTemplateCommand {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.name = data.name;
    this.description = data.description;
    this.reportType = data.reportType;
    this.template = data.template; // JSON schema for report structure
    this.parameters = data.parameters || {}; // Default parameters
    this.filters = data.filters || []; // Available filters
    this.visualizations = data.visualizations || []; // Chart configurations
    this.isPublic = data.isPublic !== undefined ? data.isPublic : false;
    this.createdBy = data.createdBy;
    this.tags = data.tags || [];
    this.metadata = data.metadata || {};
    this.createdAt = data.createdAt || new Date().toISOString();
  }

  validate() {
    if (!this.name || !this.reportType || !this.template) {
      throw new Error('Name, report type, and template are required');
    }

    if (typeof this.template !== 'object') {
      throw new Error('Template must be a valid JSON object');
    }
  }
}

export class UpdateReportTemplateCommand {
  constructor(data) {
    this.id = data.id;
    this.updates = data.updates || {};
    this.updatedBy = data.updatedBy;
    this.updatedAt = data.updatedAt || new Date().toISOString();
  }

  validate() {
    if (!this.id) {
      throw new Error('Template ID is required');
    }

    const allowedUpdates = [
      'name', 'description', 'template', 'parameters', 'filters',
      'visualizations', 'isPublic', 'tags', 'metadata'
    ];

    const invalidUpdates = Object.keys(this.updates).filter(
      key => !allowedUpdates.includes(key)
    );

    if (invalidUpdates.length > 0) {
      throw new Error(`Invalid update fields: ${invalidUpdates.join(', ')}`);
    }
  }
}

export class ExecuteScheduledReportCommand {
  constructor(data) {
    this.scheduledReportId = data.scheduledReportId;
    this.executionId = data.executionId || uuidv4();
    this.triggeredAt = data.triggeredAt || new Date().toISOString();
    this.triggeredBy = data.triggeredBy || 'scheduler';
  }

  validate() {
    if (!this.scheduledReportId) {
      throw new Error('Scheduled report ID is required');
    }
  }
}

export class CacheReportDataCommand {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.reportType = data.reportType;
    this.parameters = data.parameters || {};
    this.data = data.data;
    this.expiresAt = data.expiresAt;
    this.metadata = data.metadata || {};
    this.createdAt = data.createdAt || new Date().toISOString();
  }

  validate() {
    if (!this.reportType || !this.data) {
      throw new Error('Report type and data are required');
    }

    if (this.expiresAt && new Date(this.expiresAt) <= new Date()) {
      throw new Error('Expiration date must be in the future');
    }
  }
}

export class ExportReportDataCommand {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.reportId = data.reportId;
    this.format = data.format || 'csv';
    this.filters = data.filters || {};
    this.includeHeaders = data.includeHeaders !== undefined ? data.includeHeaders : true;
    this.delimiter = data.delimiter || ',';
    this.encoding = data.encoding || 'utf-8';
    this.compression = data.compression || 'none'; // none, gzip, zip
    this.userId = data.userId;
    this.requestedAt = data.requestedAt || new Date().toISOString();
  }

  validate() {
    if (!this.reportId) {
      throw new Error('Report ID is required');
    }

    const validFormats = ['csv', 'xlsx', 'pdf', 'xml', 'json'];
    if (!validFormats.includes(this.format)) {
      throw new Error(`Invalid export format: ${this.format}`);
    }

    const validCompressions = ['none', 'gzip', 'zip'];
    if (!validCompressions.includes(this.compression)) {
      throw new Error(`Invalid compression: ${this.compression}`);
    }
  }
}

export class GenerateDashboardCommand {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.name = data.name;
    this.description = data.description;
    this.widgets = data.widgets || []; // Array of widget configurations
    this.layout = data.layout || {}; // Dashboard layout configuration
    this.filters = data.filters || {}; // Global filters
    this.refreshInterval = data.refreshInterval || 300; // seconds
    this.isPublic = data.isPublic !== undefined ? data.isPublic : false;
    this.createdBy = data.createdBy;
    this.tags = data.tags || [];
    this.metadata = data.metadata || {};
    this.createdAt = data.createdAt || new Date().toISOString();
  }

  validate() {
    if (!this.name) {
      throw new Error('Dashboard name is required');
    }

    if (!Array.isArray(this.widgets)) {
      throw new Error('Widgets must be an array');
    }

    if (this.refreshInterval < 0) {
      throw new Error('Refresh interval must be non-negative');
    }
  }
}

export class UpdateDashboardCommand {
  constructor(data) {
    this.id = data.id;
    this.updates = data.updates || {};
    this.updatedBy = data.updatedBy;
    this.updatedAt = data.updatedAt || new Date().toISOString();
  }

  validate() {
    if (!this.id) {
      throw new Error('Dashboard ID is required');
    }

    const allowedUpdates = [
      'name', 'description', 'widgets', 'layout', 'filters',
      'refreshInterval', 'isPublic', 'tags', 'metadata'
    ];

    const invalidUpdates = Object.keys(this.updates).filter(
      key => !allowedUpdates.includes(key)
    );

    if (invalidUpdates.length > 0) {
      throw new Error(`Invalid update fields: ${invalidUpdates.join(', ')}`);
    }
  }
}