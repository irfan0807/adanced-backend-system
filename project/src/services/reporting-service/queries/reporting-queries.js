export class GetReportQuery {
  constructor(data) {
    this.reportId = data.reportId;
    this.includeData = data.includeData !== undefined ? data.includeData : true;
    this.format = data.format || 'json';
  }

  validate() {
    if (!this.reportId) {
      throw new Error('Report ID is required');
    }
  }
}

export class GetReportsQuery {
  constructor(data = {}) {
    this.filters = data.filters || {};
    this.sortBy = data.sortBy || 'createdAt';
    this.sortOrder = data.sortOrder || 'desc';
    this.limit = data.limit || 50;
    this.offset = data.offset || 0;
    this.includeData = data.includeData !== undefined ? data.includeData : false;
    this.dateRange = data.dateRange || {};
    this.userId = data.userId;
  }

  validate() {
    const validSortFields = ['createdAt', 'reportType', 'executionTime', 'recordCount'];
    if (!validSortFields.includes(this.sortBy)) {
      throw new Error(`Invalid sort field: ${this.sortBy}`);
    }

    if (!['asc', 'desc'].includes(this.sortOrder)) {
      throw new Error('Sort order must be "asc" or "desc"');
    }

    if (this.limit < 1 || this.limit > 1000) {
      throw new Error('Limit must be between 1 and 1000');
    }

    if (this.offset < 0) {
      throw new Error('Offset must be non-negative');
    }
  }
}

export class GetScheduledReportsQuery {
  constructor(data = {}) {
    this.filters = data.filters || {};
    this.status = data.status; // active, inactive, all
    this.sortBy = data.sortBy || 'nextRun';
    this.sortOrder = data.sortOrder || 'asc';
    this.limit = data.limit || 50;
    this.offset = data.offset || 0;
    this.includeExecutionHistory = data.includeExecutionHistory !== undefined ? data.includeExecutionHistory : false;
  }

  validate() {
    const validStatuses = ['active', 'inactive', 'all'];
    if (this.status && !validStatuses.includes(this.status)) {
      throw new Error(`Invalid status: ${this.status}`);
    }

    const validSortFields = ['createdAt', 'nextRun', 'lastRun', 'name'];
    if (!validSortFields.includes(this.sortBy)) {
      throw new Error(`Invalid sort field: ${this.sortBy}`);
    }
  }
}

export class GetReportTemplatesQuery {
  constructor(data = {}) {
    this.filters = data.filters || {};
    this.userId = data.userId;
    this.isPublic = data.isPublic;
    this.tags = data.tags || [];
    this.search = data.search;
    this.sortBy = data.sortBy || 'createdAt';
    this.sortOrder = data.sortOrder || 'desc';
    this.limit = data.limit || 50;
    this.offset = data.offset || 0;
  }

  validate() {
    const validSortFields = ['createdAt', 'name', 'usageCount', 'lastUsed'];
    if (!validSortFields.includes(this.sortBy)) {
      throw new Error(`Invalid sort field: ${this.sortBy}`);
    }
  }
}

export class GetReportAnalyticsQuery {
  constructor(data = {}) {
    this.reportId = data.reportId;
    this.userId = data.userId;
    this.dateRange = data.dateRange || {};
    this.groupBy = data.groupBy || 'day'; // day, week, month
    this.metrics = data.metrics || ['views', 'downloads', 'generationTime'];
    this.limit = data.limit || 100;
    this.offset = data.offset || 0;
  }

  validate() {
    if (!this.reportId && !this.userId) {
      throw new Error('Either reportId or userId is required');
    }

    const validGroupBy = ['day', 'week', 'month', 'hour'];
    if (!validGroupBy.includes(this.groupBy)) {
      throw new Error(`Invalid groupBy: ${this.groupBy}`);
    }

    const validMetrics = ['views', 'downloads', 'generationTime', 'shares', 'exports'];
    const invalidMetrics = this.metrics.filter(m => !validMetrics.includes(m));
    if (invalidMetrics.length > 0) {
      throw new Error(`Invalid metrics: ${invalidMetrics.join(', ')}`);
    }
  }
}

export class GetDashboardQuery {
  constructor(data) {
    this.dashboardId = data.dashboardId;
    this.includeData = data.includeData !== undefined ? data.includeData : true;
    this.refreshData = data.refreshData !== undefined ? data.refreshData : false;
  }

  validate() {
    if (!this.dashboardId) {
      throw new Error('Dashboard ID is required');
    }
  }
}

export class GetDashboardsQuery {
  constructor(data = {}) {
    this.filters = data.filters || {};
    this.userId = data.userId;
    this.isPublic = data.isPublic;
    this.tags = data.tags || [];
    this.search = data.search;
    this.sortBy = data.sortBy || 'createdAt';
    this.sortOrder = data.sortOrder || 'desc';
    this.limit = data.limit || 50;
    this.offset = data.offset || 0;
  }

  validate() {
    const validSortFields = ['createdAt', 'name', 'viewCount', 'lastViewed'];
    if (!validSortFields.includes(this.sortBy)) {
      throw new Error(`Invalid sort field: ${this.sortBy}`);
    }
  }
}

export class GetCachedReportDataQuery {
  constructor(data) {
    this.cacheKey = data.cacheKey;
    this.reportType = data.reportType;
    this.parameters = data.parameters || {};
    this.allowStale = data.allowStale !== undefined ? data.allowStale : true;
  }

  validate() {
    if (!this.cacheKey && !this.reportType) {
      throw new Error('Either cacheKey or reportType is required');
    }
  }
}

export class GetDataSourcesQuery {
  constructor(data = {}) {
    this.filters = data.filters || {};
    this.status = data.status; // connected, disconnected, all
    this.type = data.type; // mysql, mongodb, elasticsearch, redis
    this.sortBy = data.sortBy || 'name';
    this.sortOrder = data.sortOrder || 'asc';
    this.limit = data.limit || 50;
    this.offset = data.offset || 0;
  }

  validate() {
    const validStatuses = ['connected', 'disconnected', 'all'];
    if (this.status && !validStatuses.includes(this.status)) {
      throw new Error(`Invalid status: ${this.status}`);
    }

    const validTypes = ['mysql', 'mongodb', 'elasticsearch', 'redis', 'api'];
    if (this.type && !validTypes.includes(this.type)) {
      throw new Error(`Invalid type: ${this.type}`);
    }
  }
}

export class GetReportExecutionHistoryQuery {
  constructor(data = {}) {
    this.reportId = data.reportId;
    this.scheduledReportId = data.scheduledReportId;
    this.status = data.status; // success, failed, all
    this.dateRange = data.dateRange || {};
    this.sortBy = data.sortBy || 'executedAt';
    this.sortOrder = data.sortOrder || 'desc';
    this.limit = data.limit || 100;
    this.offset = data.offset || 0;
  }

  validate() {
    if (!this.reportId && !this.scheduledReportId) {
      throw new Error('Either reportId or scheduledReportId is required');
    }

    const validStatuses = ['success', 'failed', 'all'];
    if (this.status && !validStatuses.includes(this.status)) {
      throw new Error(`Invalid status: ${this.status}`);
    }

    const validSortFields = ['executedAt', 'executionTime', 'recordCount'];
    if (!validSortFields.includes(this.sortBy)) {
      throw new Error(`Invalid sort field: ${this.sortBy}`);
    }
  }
}

export class GetReportMetricsQuery {
  constructor(data = {}) {
    this.dateRange = data.dateRange || {};
    this.groupBy = data.groupBy || 'day';
    this.metrics = data.metrics || ['totalReports', 'avgExecutionTime', 'successRate'];
    this.filters = data.filters || {};
  }

  validate() {
    const validGroupBy = ['hour', 'day', 'week', 'month'];
    if (!validGroupBy.includes(this.groupBy)) {
      throw new Error(`Invalid groupBy: ${this.groupBy}`);
    }

    const validMetrics = [
      'totalReports', 'avgExecutionTime', 'successRate', 'totalUsers',
      'mostUsedReportType', 'peakUsageHours', 'dataVolume'
    ];
    const invalidMetrics = this.metrics.filter(m => !validMetrics.includes(m));
    if (invalidMetrics.length > 0) {
      throw new Error(`Invalid metrics: ${invalidMetrics.join(', ')}`);
    }
  }
}

export class GetRealTimeDataQuery {
  constructor(data = {}) {
    this.dataSource = data.dataSource;
    this.query = data.query;
    this.filters = data.filters || {};
    this.limit = data.limit || 1000;
    this.sortBy = data.sortBy;
    this.sortOrder = data.sortOrder || 'desc';
    this.includeMetadata = data.includeMetadata !== undefined ? data.includeMetadata : true;
  }

  validate() {
    if (!this.dataSource) {
      throw new Error('Data source is required');
    }

    if (!this.query) {
      throw new Error('Query is required');
    }

    if (this.limit < 1 || this.limit > 10000) {
      throw new Error('Limit must be between 1 and 10000');
    }
  }
}

export class GetReportTemplateUsageQuery {
  constructor(data = {}) {
    this.templateId = data.templateId;
    this.dateRange = data.dateRange || {};
    this.groupBy = data.groupBy || 'day';
    this.includeUsers = data.includeUsers !== undefined ? data.includeUsers : false;
    this.limit = data.limit || 50;
  }

  validate() {
    if (!this.templateId) {
      throw new Error('Template ID is required');
    }

    const validGroupBy = ['day', 'week', 'month'];
    if (!validGroupBy.includes(this.groupBy)) {
      throw new Error(`Invalid groupBy: ${this.groupBy}`);
    }
  }
}