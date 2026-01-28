export class GetTransactionAnalyticsQuery {
  constructor(data) {
    this.queryId = data.queryId || `query_${Date.now()}`;
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.groupBy = data.groupBy || 'day'; // 'hour', 'day', 'week', 'month'
    this.filters = data.filters || {};
    this.metrics = data.metrics || ['count', 'volume', 'average']; // which metrics to include
    this.page = data.page || 1;
    this.limit = data.limit || 100;
    this.includeRealtime = data.includeRealtime || false;

    this.validate();
  }

  validate() {
    if (this.startDate && this.endDate && new Date(this.startDate) > new Date(this.endDate)) {
      throw new Error('Start date cannot be after end date');
    }

    const validGroupBy = ['hour', 'day', 'week', 'month'];
    if (!validGroupBy.includes(this.groupBy)) {
      throw new Error(`Invalid groupBy. Must be one of: ${validGroupBy.join(', ')}`);
    }

    const validMetrics = ['count', 'volume', 'average', 'min', 'max', 'median'];
    const invalidMetrics = this.metrics.filter(m => !validMetrics.includes(m));
    if (invalidMetrics.length > 0) {
      throw new Error(`Invalid metrics: ${invalidMetrics.join(', ')}. Must be one of: ${validMetrics.join(', ')}`);
    }

    if (this.page < 1) {
      throw new Error('Page must be greater than 0');
    }

    if (this.limit < 1 || this.limit > 1000) {
      throw new Error('Limit must be between 1 and 1000');
    }
  }
}

export class GetUserActivityAnalyticsQuery {
  constructor(data) {
    this.queryId = data.queryId || `query_${Date.now()}`;
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.metric = data.metric || 'transactions'; // 'transactions', 'logins', 'accounts_created', 'payments'
    this.groupBy = data.groupBy || 'day'; // 'hour', 'day', 'week', 'month'
    this.filters = data.filters || {};
    this.segmentBy = data.segmentBy || 'all'; // 'all', 'new_users', 'active_users', 'inactive_users'
    this.page = data.page || 1;
    this.limit = data.limit || 100;
    this.includeTrends = data.includeTrends || false;

    this.validate();
  }

  validate() {
    if (this.startDate && this.endDate && new Date(this.startDate) > new Date(this.endDate)) {
      throw new Error('Start date cannot be after end date');
    }

    const validMetrics = ['transactions', 'logins', 'accounts_created', 'payments'];
    if (!validMetrics.includes(this.metric)) {
      throw new Error(`Invalid metric. Must be one of: ${validMetrics.join(', ')}`);
    }

    const validGroupBy = ['hour', 'day', 'week', 'month'];
    if (!validGroupBy.includes(this.groupBy)) {
      throw new Error(`Invalid groupBy. Must be one of: ${validGroupBy.join(', ')}`);
    }

    const validSegments = ['all', 'new_users', 'active_users', 'inactive_users'];
    if (!validSegments.includes(this.segmentBy)) {
      throw new Error(`Invalid segmentBy. Must be one of: ${validSegments.join(', ')}`);
    }

    if (this.page < 1) {
      throw new Error('Page must be greater than 0');
    }

    if (this.limit < 1 || this.limit > 1000) {
      throw new Error('Limit must be between 1 and 1000');
    }
  }
}

export class GetPaymentMethodsAnalyticsQuery {
  constructor(data) {
    this.queryId = data.queryId || `query_${Date.now()}`;
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.groupBy = data.groupBy || 'method'; // 'method', 'day', 'currency'
    this.filters = data.filters || {};
    this.includeTrends = data.includeTrends || false;
    this.includeComparison = data.includeComparison || false; // compare with previous period
    this.page = data.page || 1;
    this.limit = data.limit || 50;

    this.validate();
  }

  validate() {
    if (this.startDate && this.endDate && new Date(this.startDate) > new Date(this.endDate)) {
      throw new Error('Start date cannot be after end date');
    }

    const validGroupBy = ['method', 'day', 'currency'];
    if (!validGroupBy.includes(this.groupBy)) {
      throw new Error(`Invalid groupBy. Must be one of: ${validGroupBy.join(', ')}`);
    }

    if (this.page < 1) {
      throw new Error('Page must be greater than 0');
    }

    if (this.limit < 1 || this.limit > 1000) {
      throw new Error('Limit must be between 1 and 1000');
    }
  }
}

export class GetRevenueAnalyticsQuery {
  constructor(data) {
    this.queryId = data.queryId || `query_${Date.now()}`;
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.groupBy = data.groupBy || 'month'; // 'day', 'week', 'month', 'quarter', 'year'
    this.filters = data.filters || {};
    this.includeFees = data.includeFees || true;
    this.includeRefunds = data.includeRefunds || false;
    this.currency = data.currency; // filter by specific currency
    this.page = data.page || 1;
    this.limit = data.limit || 100;

    this.validate();
  }

  validate() {
    if (this.startDate && this.endDate && new Date(this.startDate) > new Date(this.endDate)) {
      throw new Error('Start date cannot be after end date');
    }

    const validGroupBy = ['day', 'week', 'month', 'quarter', 'year'];
    if (!validGroupBy.includes(this.groupBy)) {
      throw new Error(`Invalid groupBy. Must be one of: ${validGroupBy.join(', ')}`);
    }

    if (this.page < 1) {
      throw new Error('Page must be greater than 0');
    }

    if (this.limit < 1 || this.limit > 1000) {
      throw new Error('Limit must be between 1 and 1000');
    }
  }
}

export class GetAccountAnalyticsQuery {
  constructor(data) {
    this.queryId = data.queryId || `query_${Date.now()}`;
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.metrics = data.metrics || ['total_accounts', 'active_accounts', 'balance_distribution'];
    this.groupBy = data.groupBy || 'month'; // 'day', 'week', 'month'
    this.filters = data.filters || {};
    this.includeGeographic = data.includeGeographic || false;
    this.page = data.page || 1;
    this.limit = data.limit || 100;

    this.validate();
  }

  validate() {
    if (this.startDate && this.endDate && new Date(this.startDate) > new Date(this.endDate)) {
      throw new Error('Start date cannot be after end date');
    }

    const validMetrics = ['total_accounts', 'active_accounts', 'balance_distribution', 'account_types', 'growth_rate'];
    const invalidMetrics = this.metrics.filter(m => !validMetrics.includes(m));
    if (invalidMetrics.length > 0) {
      throw new Error(`Invalid metrics: ${invalidMetrics.join(', ')}. Must be one of: ${validMetrics.join(', ')}`);
    }

    const validGroupBy = ['day', 'week', 'month'];
    if (!validGroupBy.includes(this.groupBy)) {
      throw new Error(`Invalid groupBy. Must be one of: ${validGroupBy.join(', ')}`);
    }

    if (this.page < 1) {
      throw new Error('Page must be greater than 0');
    }

    if (this.limit < 1 || this.limit > 1000) {
      throw new Error('Limit must be between 1 and 1000');
    }
  }
}

export class GetAnalyticsDashboardQuery {
  constructor(data) {
    this.dashboardId = data.dashboardId;
    this.includeData = data.includeData || true; // whether to include actual data or just metadata
    this.refreshData = data.refreshData || false; // force refresh cached data
    this.filters = data.filters || {}; // additional filters to apply

    this.validate();
  }

  validate() {
    if (!this.dashboardId) {
      throw new Error('Dashboard ID is required');
    }
  }
}

export class GetAnalyticsDashboardsQuery {
  constructor(data) {
    this.filters = data.filters || {};
    this.page = data.page || 1;
    this.limit = data.limit || 20;
    this.sortBy = data.sortBy || 'created_at'; // 'created_at', 'updated_at', 'name'
    this.sortOrder = data.sortOrder || 'desc'; // 'asc', 'desc'

    this.validate();
  }

  validate() {
    if (this.page < 1) {
      throw new Error('Page must be greater than 0');
    }

    if (this.limit < 1 || this.limit > 100) {
      throw new Error('Limit must be between 1 and 100');
    }

    const validSortBy = ['created_at', 'updated_at', 'name'];
    if (!validSortBy.includes(this.sortBy)) {
      throw new Error(`Invalid sortBy. Must be one of: ${validSortBy.join(', ')}`);
    }

    const validSortOrder = ['asc', 'desc'];
    if (!validSortOrder.includes(this.sortOrder)) {
      throw new Error(`Invalid sortOrder. Must be one of: ${validSortOrder.join(', ')}`);
    }
  }
}

export class GetAnalyticsReportQuery {
  constructor(data) {
    this.reportId = data.reportId;
    this.includeData = data.includeData || true;
    this.format = data.format || 'json'; // 'json', 'csv', 'pdf'

    this.validate();
  }

  validate() {
    if (!this.reportId) {
      throw new Error('Report ID is required');
    }

    const validFormats = ['json', 'csv', 'pdf'];
    if (!validFormats.includes(this.format)) {
      throw new Error(`Invalid format. Must be one of: ${validFormats.join(', ')}`);
    }
  }
}

export class GetAnalyticsMetricsQuery {
  constructor(data) {
    this.metricType = data.metricType; // 'kpi', 'performance', 'health', 'custom'
    this.timeRange = data.timeRange || '30d'; // '1h', '24h', '7d', '30d', '90d', '1y'
    this.filters = data.filters || {};
    this.realTime = data.realTime || false;

    this.validate();
  }

  validate() {
    const validMetricTypes = ['kpi', 'performance', 'health', 'custom'];
    if (this.metricType && !validMetricTypes.includes(this.metricType)) {
      throw new Error(`Invalid metricType. Must be one of: ${validMetricTypes.join(', ')}`);
    }

    const validTimeRanges = ['1h', '24h', '7d', '30d', '90d', '1y'];
    if (!validTimeRanges.includes(this.timeRange)) {
      throw new Error(`Invalid timeRange. Must be one of: ${validTimeRanges.join(', ')}`);
    }
  }
}