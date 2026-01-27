export class GetRiskAssessmentQuery {
  constructor(data) {
    this.assessmentId = data.assessmentId;
    this.includeDetails = data.includeDetails !== undefined ? data.includeDetails : true;
  }

  validate() {
    if (!this.assessmentId) throw new Error('Assessment ID is required');
  }
}

export class GetRiskAssessmentsQuery {
  constructor(data) {
    this.filters = data.filters || {};
    this.sortBy = data.sortBy || 'assessedAt';
    this.sortOrder = data.sortOrder || 'desc';
    this.limit = data.limit || 50;
    this.offset = data.offset || 0;
    this.includeDetails = data.includeDetails !== undefined ? data.includeDetails : false;
  }
}

export class GetUserRiskProfileQuery {
  constructor(data) {
    this.userId = data.userId;
    this.includeHistory = data.includeHistory !== undefined ? data.includeHistory : true;
    this.timeRange = data.timeRange || '30d';
  }

  validate() {
    if (!this.userId) throw new Error('User ID is required');
  }
}

export class GetMerchantRiskProfileQuery {
  constructor(data) {
    this.merchantId = data.merchantId;
    this.includeHistory = data.includeHistory !== undefined ? data.includeHistory : true;
    this.timeRange = data.timeRange || '30d';
  }

  validate() {
    if (!this.merchantId) throw new Error('Merchant ID is required');
  }
}

export class GetRiskRulesQuery {
  constructor(data) {
    this.filters = data.filters || {};
    this.sortBy = data.sortBy || 'priority';
    this.sortOrder = data.sortOrder || 'desc';
    this.limit = data.limit || 100;
    this.offset = data.offset || 0;
  }
}

export class GetRiskRuleQuery {
  constructor(data) {
    this.ruleId = data.ruleId;
  }

  validate() {
    if (!this.ruleId) throw new Error('Rule ID is required');
  }
}

export class GetRiskMetricsQuery {
  constructor(data) {
    this.metricType = data.metricType;
    this.timeRange = data.timeRange || '24h';
    this.groupBy = data.groupBy || 'hour';
    this.filters = data.filters || {};
  }

  validate() {
    if (!this.metricType) throw new Error('Metric type is required');
  }
}

export class GetRiskAlertsQuery {
  constructor(data) {
    this.filters = data.filters || {};
    this.severity = data.severity;
    this.status = data.status || 'active';
    this.sortBy = data.sortBy || 'triggeredAt';
    this.sortOrder = data.sortOrder || 'desc';
    this.limit = data.limit || 50;
    this.offset = data.offset || 0;
  }
}

export class GetFraudPatternsQuery {
  constructor(data) {
    this.patternType = data.patternType;
    this.confidence = data.confidence;
    this.timeRange = data.timeRange || '7d';
    this.sortBy = data.sortBy || 'detectedAt';
    this.sortOrder = data.sortOrder || 'desc';
    this.limit = data.limit || 50;
    this.offset = data.offset || 0;
  }
}

export class GetRiskThresholdsQuery {
  constructor(data) {
    this.thresholdType = data.thresholdType;
    this.currency = data.currency;
    this.activeOnly = data.activeOnly !== undefined ? data.activeOnly : true;
  }
}

export class GetRiskReportQuery {
  constructor(data) {
    this.reportId = data.reportId;
    this.includeData = data.includeData !== undefined ? data.includeData : true;
  }

  validate() {
    if (!this.reportId) throw new Error('Report ID is required');
  }
}

export class GetRiskReportsQuery {
  constructor(data) {
    this.filters = data.filters || {};
    this.sortBy = data.sortBy || 'generatedAt';
    this.sortOrder = data.sortOrder || 'desc';
    this.limit = data.limit || 50;
    this.offset = data.offset || 0;
    this.includeData = data.includeData !== undefined ? data.includeData : false;
  }
}

export class GetRiskDashboardQuery {
  constructor(data) {
    this.timeRange = data.timeRange || '24h';
    this.includeAlerts = data.includeAlerts !== undefined ? data.includeAlerts : true;
    this.includeMetrics = data.includeMetrics !== undefined ? data.includeMetrics : true;
    this.includeTopRisks = data.includeTopRisks !== undefined ? data.includeTopRisks : true;
  }
}

export class GetRiskAnalyticsQuery {
  constructor(data) {
    this.analyticsType = data.analyticsType;
    this.timeRange = data.timeRange || '30d';
    this.groupBy = data.groupBy || 'day';
    this.filters = data.filters || {};
    this.includeTrends = data.includeTrends !== undefined ? data.includeTrends : true;
  }

  validate() {
    if (!this.analyticsType) throw new Error('Analytics type is required');
  }
}