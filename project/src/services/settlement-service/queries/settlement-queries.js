export class GetSettlementQuery {
  constructor(settlementId, includeDetails = true) {
    this.settlementId = settlementId;
    this.includeDetails = includeDetails;
  }

  validate() {
    if (!this.settlementId) throw new Error('Settlement ID is required');
    return true;
  }
}

export class GetSettlementsQuery {
  constructor(filters = {}, pagination = {}) {
    this.filters = {
      merchantId: filters.merchantId,
      status: filters.status,
      startDate: filters.startDate,
      endDate: filters.endDate,
      minAmount: filters.minAmount,
      maxAmount: filters.maxAmount,
      currency: filters.currency,
      settlementMethod: filters.settlementMethod
    };
    this.pagination = {
      page: pagination.page || 1,
      limit: pagination.limit || 50,
      sortBy: pagination.sortBy || 'createdAt',
      sortOrder: pagination.sortOrder || 'desc'
    };
    this.includeDetails = filters.includeDetails !== undefined ? filters.includeDetails : false;
  }

  validate() {
    if (this.pagination.limit > 1000) {
      throw new Error('Maximum limit is 1000 records');
    }
    return true;
  }
}

export class GetMerchantSettlementsQuery {
  constructor(merchantId, filters = {}, pagination = {}) {
    this.merchantId = merchantId;
    this.filters = {
      status: filters.status,
      startDate: filters.startDate,
      endDate: filters.endDate,
      minAmount: filters.minAmount,
      maxAmount: filters.maxAmount
    };
    this.pagination = {
      page: pagination.page || 1,
      limit: pagination.limit || 50,
      sortBy: pagination.sortBy || 'createdAt',
      sortOrder: pagination.sortOrder || 'desc'
    };
    this.includeTransactions = filters.includeTransactions || false;
  }

  validate() {
    if (!this.merchantId) throw new Error('Merchant ID is required');
    if (this.pagination.limit > 1000) {
      throw new Error('Maximum limit is 1000 records');
    }
    return true;
  }
}

export class GetSettlementScheduleQuery {
  constructor(merchantId) {
    this.merchantId = merchantId;
  }

  validate() {
    if (!this.merchantId) throw new Error('Merchant ID is required');
    return true;
  }
}

export class GetSettlementAnalyticsQuery {
  constructor(analyticsType, filters = {}) {
    this.analyticsType = analyticsType; // 'volume', 'trends', 'performance', 'reconciliation'
    this.filters = {
      merchantId: filters.merchantId,
      startDate: filters.startDate,
      endDate: filters.endDate,
      groupBy: filters.groupBy || 'day', // 'hour', 'day', 'week', 'month'
      currency: filters.currency
    };
  }

  validate() {
    if (!['volume', 'trends', 'performance', 'reconciliation'].includes(this.analyticsType)) {
      throw new Error('Invalid analytics type');
    }
    return true;
  }
}

export class GetSettlementReconciliationQuery {
  constructor(filters = {}) {
    this.filters = {
      startDate: filters.startDate,
      endDate: filters.endDate,
      merchantId: filters.merchantId,
      status: filters.status,
      includeDiscrepancies: filters.includeDiscrepancies !== undefined ? filters.includeDiscrepancies : true
    };
  }

  validate() {
    if (!this.filters.startDate || !this.filters.endDate) {
      throw new Error('Date range is required for reconciliation');
    }
    return true;
  }
}

export class GetSettlementHoldsQuery {
  constructor(filters = {}, pagination = {}) {
    this.filters = {
      settlementId: filters.settlementId,
      merchantId: filters.merchantId,
      holdType: filters.holdType,
      status: filters.status, // 'active', 'released', 'expired'
      startDate: filters.startDate,
      endDate: filters.endDate
    };
    this.pagination = {
      page: pagination.page || 1,
      limit: pagination.limit || 50,
      sortBy: pagination.sortBy || 'placedAt',
      sortOrder: pagination.sortOrder || 'desc'
    };
  }

  validate() {
    if (this.pagination.limit > 1000) {
      throw new Error('Maximum limit is 1000 records');
    }
    return true;
  }
}

export class GetSettlementAdjustmentsQuery {
  constructor(settlementId, pagination = {}) {
    this.settlementId = settlementId;
    this.pagination = {
      page: pagination.page || 1,
      limit: pagination.limit || 50,
      sortBy: pagination.sortBy || 'adjustedAt',
      sortOrder: pagination.sortOrder || 'desc'
    };
  }

  validate() {
    if (!this.settlementId) throw new Error('Settlement ID is required');
    if (this.pagination.limit > 1000) {
      throw new Error('Maximum limit is 1000 records');
    }
    return true;
  }
}

export class GetSettlementDisputesQuery {
  constructor(filters = {}, pagination = {}) {
    this.filters = {
      settlementId: filters.settlementId,
      merchantId: filters.merchantId,
      status: filters.status, // 'open', 'resolved', 'escalated'
      startDate: filters.startDate,
      endDate: filters.endDate
    };
    this.pagination = {
      page: pagination.page || 1,
      limit: pagination.limit || 50,
      sortBy: pagination.sortBy || 'createdAt',
      sortOrder: pagination.sortOrder || 'desc'
    };
  }

  validate() {
    if (this.pagination.limit > 1000) {
      throw new Error('Maximum limit is 1000 records');
    }
    return true;
  }
}

export class GetSettlementDashboardQuery {
  constructor(filters = {}) {
    this.filters = {
      merchantId: filters.merchantId,
      timeRange: filters.timeRange || '30d',
      includePending: filters.includePending !== undefined ? filters.includePending : true,
      includeCompleted: filters.includeCompleted !== undefined ? filters.includeCompleted : true,
      includeFailed: filters.includeFailed !== undefined ? filters.includeFailed : true
    };
  }

  validate() {
    const validRanges = ['24h', '7d', '30d', '90d', '1y'];
    if (!validRanges.includes(this.filters.timeRange)) {
      throw new Error('Invalid time range. Must be one of: ' + validRanges.join(', '));
    }
    return true;
  }
}

export class GetSettlementReportQuery {
  constructor(reportType, filters = {}) {
    this.reportType = reportType; // 'daily', 'weekly', 'monthly', 'custom'
    this.filters = {
      merchantId: filters.merchantId,
      startDate: filters.startDate,
      endDate: filters.endDate,
      format: filters.format || 'json', // 'json', 'csv', 'pdf'
      includeTransactions: filters.includeTransactions || false,
      includeAdjustments: filters.includeAdjustments || false
    };
  }

  validate() {
    if (!['daily', 'weekly', 'monthly', 'custom'].includes(this.reportType)) {
      throw new Error('Invalid report type');
    }
    if (this.reportType === 'custom' && (!this.filters.startDate || !this.filters.endDate)) {
      throw new Error('Start and end dates are required for custom reports');
    }
    return true;
  }
}

export class GetSettlementMetricsQuery {
  constructor(metricType, filters = {}) {
    this.metricType = metricType; // 'processing_time', 'success_rate', 'volume', 'fees'
    this.filters = {
      merchantId: filters.merchantId,
      startDate: filters.startDate,
      endDate: filters.endDate,
      groupBy: filters.groupBy || 'day'
    };
  }

  validate() {
    if (!['processing_time', 'success_rate', 'volume', 'fees'].includes(this.metricType)) {
      throw new Error('Invalid metric type');
    }
    return true;
  }
}