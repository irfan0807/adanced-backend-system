export class AnalyticsReportGeneratedEvent {
  constructor(data) {
    this.eventType = 'AnalyticsReportGenerated';
    this.aggregateId = data.reportId;
    this.reportId = data.reportId;
    this.reportType = data.reportType;
    this.parameters = data.parameters || {};
    this.filters = data.filters || {};
    this.data = data.data || {};
    this.generatedBy = data.generatedBy;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
  }
}

export class AnalyticsDataUpdatedEvent {
  constructor(data) {
    this.eventType = 'AnalyticsDataUpdated';
    this.aggregateId = data.dataId || `analytics_${data.dataType}_${Date.now()}`;
    this.dataType = data.dataType;
    this.data = data.data;
    this.source = data.source;
    this.updatedBy = data.updatedBy;
    this.changes = data.changes || {};
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
  }
}

export class AnalyticsCacheRefreshedEvent {
  constructor(data) {
    this.eventType = 'AnalyticsCacheRefreshed';
    this.aggregateId = `cache_refresh_${Date.now()}`;
    this.cacheType = data.cacheType;
    this.forceRefresh = data.forceRefresh;
    this.refreshedBy = data.refreshedBy;
    this.affectedRecords = data.affectedRecords || 0;
    this.duration = data.duration || 0; // milliseconds
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
  }
}

export class AnalyticsDataExportedEvent {
  constructor(data) {
    this.eventType = 'AnalyticsDataExported';
    this.aggregateId = data.exportId;
    this.exportId = data.exportId;
    this.reportType = data.reportType;
    this.format = data.format;
    this.filters = data.filters || {};
    this.fileSize = data.fileSize || 0;
    this.recordCount = data.recordCount || 0;
    this.exportedBy = data.exportedBy;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
  }
}

export class AnalyticsDashboardCreatedEvent {
  constructor(data) {
    this.eventType = 'AnalyticsDashboardCreated';
    this.aggregateId = data.dashboardId;
    this.dashboardId = data.dashboardId;
    this.name = data.name;
    this.description = data.description;
    this.widgets = data.widgets || [];
    this.filters = data.filters || {};
    this.refreshInterval = data.refreshInterval;
    this.createdBy = data.createdBy;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
  }
}

export class AnalyticsDashboardUpdatedEvent {
  constructor(data) {
    this.eventType = 'AnalyticsDashboardUpdated';
    this.aggregateId = data.dashboardId;
    this.dashboardId = data.dashboardId;
    this.updates = data.updates || {};
    this.updatedBy = data.updatedBy;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
  }
}

export class AnalyticsMetricsCalculatedEvent {
  constructor(data) {
    this.eventType = 'AnalyticsMetricsCalculated';
    this.aggregateId = `metrics_${data.metricType}_${Date.now()}`;
    this.metricType = data.metricType;
    this.period = data.period || {};
    this.metrics = data.metrics || {};
    this.baseline = data.baseline || {};
    this.change = data.change || {};
    this.calculatedBy = data.calculatedBy || 'system';
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
  }
}

export class AnalyticsAlertTriggeredEvent {
  constructor(data) {
    this.eventType = 'AnalyticsAlertTriggered';
    this.aggregateId = `alert_${data.alertId}_${Date.now()}`;
    this.alertId = data.alertId;
    this.alertType = data.alertType;
    this.metric = data.metric;
    this.threshold = data.threshold;
    this.currentValue = data.currentValue;
    this.severity = data.severity || 'medium'; // 'low', 'medium', 'high', 'critical'
    this.message = data.message;
    this.recipients = data.recipients || [];
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
  }
}

export class AnalyticsRealTimeUpdateEvent {
  constructor(data) {
    this.eventType = 'AnalyticsRealTimeUpdate';
    this.aggregateId = `realtime_${data.updateType}_${Date.now()}`;
    this.updateType = data.updateType; // 'transaction', 'account', 'payment', 'user'
    this.data = data.data || {};
    this.sourceEvent = data.sourceEvent;
    this.affectedMetrics = data.affectedMetrics || [];
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
  }
}