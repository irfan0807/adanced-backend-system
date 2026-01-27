export class ReportGeneratedEvent {
  constructor(data) {
    this.eventType = 'ReportGenerated';
    this.aggregateId = data.reportId;
    this.eventId = data.eventId || require('uuid').v4();
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventData = {
      reportType: data.reportType,
      parameters: data.parameters,
      format: data.format,
      generatedBy: data.generatedBy,
      executionTime: data.executionTime,
      recordCount: data.recordCount,
      fileSize: data.fileSize,
      status: data.status || 'completed'
    };
    this.metadata = data.metadata || {};
  }
}

export class ReportGenerationFailedEvent {
  constructor(data) {
    this.eventType = 'ReportGenerationFailed';
    this.aggregateId = data.reportId;
    this.eventId = data.eventId || require('uuid').v4();
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventData = {
      reportType: data.reportType,
      parameters: data.parameters,
      error: data.error,
      errorCode: data.errorCode,
      retryCount: data.retryCount || 0,
      failedAt: data.failedAt || new Date().toISOString()
    };
    this.metadata = data.metadata || {};
  }
}

export class ScheduledReportCreatedEvent {
  constructor(data) {
    this.eventType = 'ScheduledReportCreated';
    this.aggregateId = data.scheduledReportId;
    this.eventId = data.eventId || require('uuid').v4();
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventData = {
      name: data.name,
      reportType: data.reportType,
      schedule: data.schedule,
      parameters: data.parameters,
      format: data.format,
      recipients: data.recipients,
      deliveryMethod: data.deliveryMethod,
      createdBy: data.createdBy
    };
    this.metadata = data.metadata || {};
  }
}

export class ScheduledReportExecutedEvent {
  constructor(data) {
    this.eventType = 'ScheduledReportExecuted';
    this.aggregateId = data.scheduledReportId;
    this.eventId = data.eventId || require('uuid').v4();
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventData = {
      executionId: data.executionId,
      triggeredBy: data.triggeredBy,
      executionTime: data.executionTime,
      recordCount: data.recordCount,
      deliveryStatus: data.deliveryStatus,
      nextRun: data.nextRun
    };
    this.metadata = data.metadata || {};
  }
}

export class ScheduledReportUpdatedEvent {
  constructor(data) {
    this.eventType = 'ScheduledReportUpdated';
    this.aggregateId = data.scheduledReportId;
    this.eventId = data.eventId || require('uuid').v4();
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventData = {
      updates: data.updates,
      updatedBy: data.updatedBy,
      previousValues: data.previousValues
    };
    this.metadata = data.metadata || {};
  }
}

export class ScheduledReportDeletedEvent {
  constructor(data) {
    this.eventType = 'ScheduledReportDeleted';
    this.aggregateId = data.scheduledReportId;
    this.eventId = data.eventId || require('uuid').v4();
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventData = {
      deletedBy: data.deletedBy,
      deletionReason: data.deletionReason
    };
    this.metadata = data.metadata || {};
  }
}

export class ReportTemplateCreatedEvent {
  constructor(data) {
    this.eventType = 'ReportTemplateCreated';
    this.aggregateId = data.templateId;
    this.eventId = data.eventId || require('uuid').v4();
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventData = {
      name: data.name,
      description: data.description,
      reportType: data.reportType,
      createdBy: data.createdBy,
      isPublic: data.isPublic,
      tags: data.tags
    };
    this.metadata = data.metadata || {};
  }
}

export class ReportTemplateUpdatedEvent {
  constructor(data) {
    this.eventType = 'ReportTemplateUpdated';
    this.aggregateId = data.templateId;
    this.eventId = data.eventId || require('uuid').v4();
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventData = {
      updates: data.updates,
      updatedBy: data.updatedBy,
      previousValues: data.previousValues
    };
    this.metadata = data.metadata || {};
  }
}

export class ReportDataCachedEvent {
  constructor(data) {
    this.eventType = 'ReportDataCached';
    this.aggregateId = data.cacheId;
    this.eventId = data.eventId || require('uuid').v4();
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventData = {
      reportType: data.reportType,
      parameters: data.parameters,
      dataSize: data.dataSize,
      expiresAt: data.expiresAt,
      cacheKey: data.cacheKey
    };
    this.metadata = data.metadata || {};
  }
}

export class ReportDataExportedEvent {
  constructor(data) {
    this.eventType = 'ReportDataExported';
    this.aggregateId = data.exportId;
    this.eventId = data.eventId || require('uuid').v4();
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventData = {
      reportId: data.reportId,
      format: data.format,
      recordCount: data.recordCount,
      fileSize: data.fileSize,
      exportedBy: data.exportedBy,
      downloadUrl: data.downloadUrl,
      expiresAt: data.expiresAt
    };
    this.metadata = data.metadata || {};
  }
}

export class DashboardCreatedEvent {
  constructor(data) {
    this.eventType = 'DashboardCreated';
    this.aggregateId = data.dashboardId;
    this.eventId = data.eventId || require('uuid').v4();
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventData = {
      name: data.name,
      description: data.description,
      widgetCount: data.widgetCount,
      createdBy: data.createdBy,
      isPublic: data.isPublic,
      tags: data.tags
    };
    this.metadata = data.metadata || {};
  }
}

export class DashboardUpdatedEvent {
  constructor(data) {
    this.eventType = 'DashboardUpdated';
    this.aggregateId = data.dashboardId;
    this.eventId = data.eventId || require('uuid').v4();
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventData = {
      updates: data.updates,
      updatedBy: data.updatedBy,
      widgetCount: data.widgetCount
    };
    this.metadata = data.metadata || {};
  }
}

export class DashboardViewedEvent {
  constructor(data) {
    this.eventType = 'DashboardViewed';
    this.aggregateId = data.dashboardId;
    this.eventId = data.eventId || require('uuid').v4();
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventData = {
      viewedBy: data.viewedBy,
      viewDuration: data.viewDuration,
      userAgent: data.userAgent,
      ipAddress: data.ipAddress
    };
    this.metadata = data.metadata || {};
  }
}

export class ReportAnalyticsEvent {
  constructor(data) {
    this.eventType = 'ReportAnalytics';
    this.aggregateId = data.reportId || data.analyticsId;
    this.eventId = data.eventId || require('uuid').v4();
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventData = {
      reportType: data.reportType,
      action: data.action, // generated, viewed, downloaded, shared
      userId: data.userId,
      sessionId: data.sessionId,
      duration: data.duration,
      filters: data.filters,
      performance: data.performance
    };
    this.metadata = data.metadata || {};
  }
}

export class DataSourceConnectedEvent {
  constructor(data) {
    this.eventType = 'DataSourceConnected';
    this.aggregateId = data.dataSourceId;
    this.eventId = data.eventId || require('uuid').v4();
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventData = {
      name: data.name,
      type: data.type, // mysql, mongodb, elasticsearch, redis
      connectionString: data.connectionString, // masked
      status: data.status || 'connected',
      connectedBy: data.connectedBy
    };
    this.metadata = data.metadata || {};
  }
}

export class DataSourceDisconnectedEvent {
  constructor(data) {
    this.eventType = 'DataSourceDisconnected';
    this.aggregateId = data.dataSourceId;
    this.eventId = data.eventId || require('uuid').v4();
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventData = {
      disconnectedBy: data.disconnectedBy,
      reason: data.reason,
      lastActivity: data.lastActivity
    };
    this.metadata = data.metadata || {};
  }
}