export class GetExchangeRatesQuery {
  constructor(data) {
    this.baseCurrency = data.baseCurrency || 'USD';
    this.targetCurrencies = data.targetCurrencies || [];
    this.includeHistorical = data.includeHistorical || false;
    this.date = data.date; // For historical rates
    this.source = data.source; // Filter by rate source
    this.metadata = data.metadata || {};
  }

  validate() {
    if (this.baseCurrency && !/^[A-Z]{3}$/.test(this.baseCurrency)) {
      throw new Error('Base currency must be a valid 3-letter currency code');
    }

    if (this.targetCurrencies && this.targetCurrencies.length > 0) {
      for (const currency of this.targetCurrencies) {
        if (!/^[A-Z]{3}$/.test(currency)) {
          throw new Error(`Invalid target currency: ${currency}`);
        }
      }
    }

    if (this.date && isNaN(Date.parse(this.date))) {
      throw new Error('Invalid date format');
    }
  }
}

export class GetCurrencyConversionQuery {
  constructor(data) {
    this.fromCurrency = data.fromCurrency;
    this.toCurrency = data.toCurrency;
    this.amount = data.amount;
    this.date = data.date; // For historical conversion
    this.includeFee = data.includeFee || false;
    this.metadata = data.metadata || {};
  }

  validate() {
    if (!this.fromCurrency) {
      throw new Error('From currency is required');
    }
    if (!this.toCurrency) {
      throw new Error('To currency is required');
    }
    if (!this.amount || this.amount <= 0) {
      throw new Error('Valid amount is required');
    }

    const currencyRegex = /^[A-Z]{3}$/;
    if (!currencyRegex.test(this.fromCurrency)) {
      throw new Error('From currency must be a valid 3-letter currency code');
    }
    if (!currencyRegex.test(this.toCurrency)) {
      throw new Error('To currency must be a valid 3-letter currency code');
    }

    if (this.date && isNaN(Date.parse(this.date))) {
      throw new Error('Invalid date format');
    }
  }
}

export class GetSupportedCurrenciesQuery {
  constructor(data) {
    this.includeInactive = data.includeInactive || false;
    this.filterBy = data.filterBy || {}; // { region: 'EUR', type: 'fiat' }
    this.sortBy = data.sortBy || 'currencyCode';
    this.sortOrder = data.sortOrder || 'asc';
    this.metadata = data.metadata || {};
  }

  validate() {
    const validSortFields = ['currencyCode', 'currencyName', 'addedDate'];
    if (!validSortFields.includes(this.sortBy)) {
      throw new Error(`Invalid sort field: ${this.sortBy}`);
    }

    if (!['asc', 'desc'].includes(this.sortOrder)) {
      throw new Error('Sort order must be asc or desc');
    }
  }
}

export class GetCurrencyHistoryQuery {
  constructor(data) {
    this.currencyCode = data.currencyCode;
    this.baseCurrency = data.baseCurrency || 'USD';
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.interval = data.interval || 'daily'; // 'hourly', 'daily', 'weekly', 'monthly'
    this.limit = data.limit || 100;
    this.metadata = data.metadata || {};
  }

  validate() {
    if (!this.currencyCode) {
      throw new Error('Currency code is required');
    }

    const currencyRegex = /^[A-Z]{3}$/;
    if (!currencyRegex.test(this.currencyCode)) {
      throw new Error('Currency code must be a valid 3-letter currency code');
    }
    if (this.baseCurrency && !currencyRegex.test(this.baseCurrency)) {
      throw new Error('Base currency must be a valid 3-letter currency code');
    }

    if (!this.startDate || !this.endDate) {
      throw new Error('Start date and end date are required');
    }

    const start = new Date(this.startDate);
    const end = new Date(this.endDate);
    if (start > end) {
      throw new Error('Start date cannot be after end date');
    }

    const validIntervals = ['hourly', 'daily', 'weekly', 'monthly'];
    if (!validIntervals.includes(this.interval)) {
      throw new Error(`Invalid interval: ${this.interval}`);
    }

    if (this.limit < 1 || this.limit > 1000) {
      throw new Error('Limit must be between 1 and 1000');
    }
  }
}

export class GetCurrencyAnalyticsQuery {
  constructor(data) {
    this.currencyCode = data.currencyCode;
    this.timeframe = data.timeframe || '30d'; // '1d', '7d', '30d', '90d', '1y'
    this.metrics = data.metrics || ['volatility', 'trend', 'volume'];
    this.compareWith = data.compareWith || []; // Array of currency codes to compare
    this.metadata = data.metadata || {};
  }

  validate() {
    if (this.currencyCode && !/^[A-Z]{3}$/.test(this.currencyCode)) {
      throw new Error('Currency code must be a valid 3-letter currency code');
    }

    const validTimeframes = ['1d', '7d', '30d', '90d', '1y'];
    if (!validTimeframes.includes(this.timeframe)) {
      throw new Error(`Invalid timeframe: ${this.timeframe}`);
    }

    const validMetrics = ['volatility', 'trend', 'volume', 'correlation', 'spread'];
    for (const metric of this.metrics) {
      if (!validMetrics.includes(metric)) {
        throw new Error(`Invalid metric: ${metric}`);
      }
    }

    for (const currency of this.compareWith) {
      if (!/^[A-Z]{3}$/.test(currency)) {
        throw new Error(`Invalid comparison currency: ${currency}`);
      }
    }
  }
}

export class GetCurrencyAlertsQuery {
  constructor(data) {
    this.currencyCode = data.currencyCode;
    this.alertType = data.alertType; // 'rate', 'volume', 'volatility'
    this.status = data.status || 'active'; // 'active', 'triggered', 'expired'
    this.page = data.page || 1;
    this.limit = data.limit || 20;
    this.metadata = data.metadata || {};
  }

  validate() {
    if (this.currencyCode && !/^[A-Z]{3}$/.test(this.currencyCode)) {
      throw new Error('Currency code must be a valid 3-letter currency code');
    }

    const validAlertTypes = ['rate', 'volume', 'volatility'];
    if (this.alertType && !validAlertTypes.includes(this.alertType)) {
      throw new Error(`Invalid alert type: ${this.alertType}`);
    }

    const validStatuses = ['active', 'triggered', 'expired', 'all'];
    if (!validStatuses.includes(this.status)) {
      throw new Error(`Invalid status: ${this.status}`);
    }

    if (this.page < 1) {
      throw new Error('Page must be greater than 0');
    }
    if (this.limit < 1 || this.limit > 100) {
      throw new Error('Limit must be between 1 and 100');
    }
  }
}

export class GetCurrencyServiceStatusQuery {
  constructor(data) {
    this.includeHealth = data.includeHealth || true;
    this.includeStats = data.includeStats || true;
    this.includeConfig = data.includeConfig || false;
    this.metadata = data.metadata || {};
  }

  validate() {
    // No specific validation needed for this query
  }
}

export class GetExchangeRateSourcesQuery {
  constructor(data) {
    this.includeStatus = data.includeStatus || true;
    this.includeHistory = data.includeHistory || false;
    this.limit = data.limit || 10;
    this.metadata = data.metadata || {};
  }

  validate() {
    if (this.limit < 1 || this.limit > 50) {
      throw new Error('Limit must be between 1 and 50');
    }
  }
}

export class GetCurrencyConversionHistoryQuery {
  constructor(data) {
    this.userId = data.userId;
    this.fromCurrency = data.fromCurrency;
    this.toCurrency = data.toCurrency;
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.minAmount = data.minAmount;
    this.maxAmount = data.maxAmount;
    this.page = data.page || 1;
    this.limit = data.limit || 20;
    this.sortBy = data.sortBy || 'timestamp';
    this.sortOrder = data.sortOrder || 'desc';
    this.metadata = data.metadata || {};
  }

  validate() {
    const currencyRegex = /^[A-Z]{3}$/;
    if (this.fromCurrency && !currencyRegex.test(this.fromCurrency)) {
      throw new Error('From currency must be a valid 3-letter currency code');
    }
    if (this.toCurrency && !currencyRegex.test(this.toCurrency)) {
      throw new Error('To currency must be a valid 3-letter currency code');
    }

    if (this.startDate && this.endDate) {
      const start = new Date(this.startDate);
      const end = new Date(this.endDate);
      if (start > end) {
        throw new Error('Start date cannot be after end date');
      }
    }

    if (this.minAmount && this.maxAmount && this.minAmount > this.maxAmount) {
      throw new Error('Min amount cannot be greater than max amount');
    }

    const validSortFields = ['timestamp', 'amount', 'convertedAmount', 'fromCurrency', 'toCurrency'];
    if (!validSortFields.includes(this.sortBy)) {
      throw new Error(`Invalid sort field: ${this.sortBy}`);
    }

    if (!['asc', 'desc'].includes(this.sortOrder)) {
      throw new Error('Sort order must be asc or desc');
    }

    if (this.page < 1) {
      throw new Error('Page must be greater than 0');
    }
    if (this.limit < 1 || this.limit > 100) {
      throw new Error('Limit must be between 1 and 100');
    }
  }
}

export class GetCurrencyPairsQuery {
  constructor(data) {
    this.baseCurrencies = data.baseCurrencies || [];
    this.quoteCurrencies = data.quoteCurrencies || [];
    this.includeInactive = data.includeInactive || false;
    this.sortBy = data.sortBy || 'pair';
    this.sortOrder = data.sortOrder || 'asc';
    this.metadata = data.metadata || {};
  }

  validate() {
    const currencyRegex = /^[A-Z]{3}$/;
    for (const currency of this.baseCurrencies) {
      if (!currencyRegex.test(currency)) {
        throw new Error(`Invalid base currency: ${currency}`);
      }
    }
    for (const currency of this.quoteCurrencies) {
      if (!currencyRegex.test(currency)) {
        throw new Error(`Invalid quote currency: ${currency}`);
      }
    }

    const validSortFields = ['pair', 'volume', 'volatility', 'lastUpdate'];
    if (!validSortFields.includes(this.sortBy)) {
      throw new Error(`Invalid sort field: ${this.sortBy}`);
    }

    if (!['asc', 'desc'].includes(this.sortOrder)) {
      throw new Error('Sort order must be asc or desc');
    }
  }
}

export class GetBulkCurrencyUpdatesQuery {
  constructor(data) {
    this.batchId = data.batchId;
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.source = data.source;
    this.requestedBy = data.requestedBy;
    this.status = data.status || 'all'; // 'successful', 'failed', 'all'
    this.page = data.page || 1;
    this.limit = data.limit || 20;
    this.metadata = data.metadata || {};
  }

  validate() {
    if (this.startDate && this.endDate) {
      const start = new Date(this.startDate);
      const end = new Date(this.endDate);
      if (start > end) {
        throw new Error('Start date cannot be after end date');
      }
    }

    const validStatuses = ['successful', 'failed', 'all'];
    if (!validStatuses.includes(this.status)) {
      throw new Error(`Invalid status: ${this.status}`);
    }

    if (this.page < 1) {
      throw new Error('Page must be greater than 0');
    }
    if (this.limit < 1 || this.limit > 100) {
      throw new Error('Limit must be between 1 and 100');
    }
  }
}

export class GetArchivedCurrencyDataQuery {
  constructor(data) {
    this.criteria = data.criteria || {};
    this.archiveLocation = data.archiveLocation;
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.requestedBy = data.requestedBy;
    this.includeMetadata = data.includeMetadata || true;
    this.page = data.page || 1;
    this.limit = data.limit || 20;
    this.metadata = data.metadata || {};
  }

  validate() {
    if (this.startDate && this.endDate) {
      const start = new Date(this.startDate);
      const end = new Date(this.endDate);
      if (start > end) {
        throw new Error('Start date cannot be after end date');
      }
    }

    if (this.page < 1) {
      throw new Error('Page must be greater than 0');
    }
    if (this.limit < 1 || this.limit > 100) {
      throw new Error('Limit must be between 1 and 100');
    }
  }
}

export class GetSuspiciousCurrencyActivitiesQuery {
  constructor(data) {
    this.conversionId = data.conversionId;
    this.userId = data.userId;
    this.activityType = data.activityType;
    this.severity = data.severity; // 'low', 'medium', 'high', 'critical'
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.status = data.status || 'all'; // 'open', 'investigating', 'resolved', 'all'
    this.minRiskScore = data.minRiskScore;
    this.maxRiskScore = data.maxRiskScore;
    this.page = data.page || 1;
    this.limit = data.limit || 20;
    this.sortBy = data.sortBy || 'timestamp';
    this.sortOrder = data.sortOrder || 'desc';
    this.metadata = data.metadata || {};
  }

  validate() {
    const validSeverities = ['low', 'medium', 'high', 'critical'];
    if (this.severity && !validSeverities.includes(this.severity)) {
      throw new Error(`Invalid severity: ${this.severity}`);
    }

    const validStatuses = ['open', 'investigating', 'resolved', 'all'];
    if (!validStatuses.includes(this.status)) {
      throw new Error(`Invalid status: ${this.status}`);
    }

    if (this.startDate && this.endDate) {
      const start = new Date(this.startDate);
      const end = new Date(this.endDate);
      if (start > end) {
        throw new Error('Start date cannot be after end date');
      }
    }

    if (this.minRiskScore && this.maxRiskScore && this.minRiskScore > this.maxRiskScore) {
      throw new Error('Min risk score cannot be greater than max risk score');
    }

    const validSortFields = ['timestamp', 'severity', 'riskScore', 'activityType'];
    if (!validSortFields.includes(this.sortBy)) {
      throw new Error(`Invalid sort field: ${this.sortBy}`);
    }

    if (!['asc', 'desc'].includes(this.sortOrder)) {
      throw new Error('Sort order must be asc or desc');
    }

    if (this.page < 1) {
      throw new Error('Page must be greater than 0');
    }
    if (this.limit < 1 || this.limit > 100) {
      throw new Error('Limit must be between 1 and 100');
    }
  }
}

export class GetCurrencyReportsQuery {
  constructor(data) {
    this.reportType = data.reportType;
    this.generatedBy = data.generatedBy;
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.status = data.status || 'all'; // 'completed', 'failed', 'in_progress', 'all'
    this.format = data.format;
    this.page = data.page || 1;
    this.limit = data.limit || 20;
    this.sortBy = data.sortBy || 'generatedAt';
    this.sortOrder = data.sortOrder || 'desc';
    this.metadata = data.metadata || {};
  }

  validate() {
    const validReportTypes = [
      'conversion-summary', 'exchange-rate-analysis', 'currency-exposure',
      'regulatory-compliance', 'fraud-analysis', 'revenue-report',
      'user-activity', 'market-volatility', 'custom-currency'
    ];

    if (this.reportType && !validReportTypes.includes(this.reportType)) {
      throw new Error(`Invalid report type: ${this.reportType}`);
    }

    const validStatuses = ['completed', 'failed', 'in_progress', 'all'];
    if (!validStatuses.includes(this.status)) {
      throw new Error(`Invalid status: ${this.status}`);
    }

    const validFormats = ['json', 'csv', 'pdf', 'xlsx', 'xml'];
    if (this.format && !validFormats.includes(this.format)) {
      throw new Error(`Invalid format: ${this.format}`);
    }

    if (this.startDate && this.endDate) {
      const start = new Date(this.startDate);
      const end = new Date(this.endDate);
      if (start > end) {
        throw new Error('Start date cannot be after end date');
      }
    }

    const validSortFields = ['generatedAt', 'reportType', 'fileSize', 'generationTime'];
    if (!validSortFields.includes(this.sortBy)) {
      throw new Error(`Invalid sort field: ${this.sortBy}`);
    }

    if (!['asc', 'desc'].includes(this.sortOrder)) {
      throw new Error('Sort order must be asc or desc');
    }

    if (this.page < 1) {
      throw new Error('Page must be greater than 0');
    }
    if (this.limit < 1 || this.limit > 100) {
      throw new Error('Limit must be between 1 and 100');
    }
  }
}

export class GetCurrencyRetentionPoliciesQuery {
  constructor(data) {
    this.policyId = data.policyId;
    this.name = data.name;
    this.approvedBy = data.approvedBy;
    this.status = data.status || 'active'; // 'active', 'inactive', 'expired', 'all'
    this.effectiveDate = data.effectiveDate;
    this.page = data.page || 1;
    this.limit = data.limit || 20;
    this.metadata = data.metadata || {};
  }

  validate() {
    const validStatuses = ['active', 'inactive', 'expired', 'all'];
    if (!validStatuses.includes(this.status)) {
      throw new Error(`Invalid status: ${this.status}`);
    }

    if (this.page < 1) {
      throw new Error('Page must be greater than 0');
    }
    if (this.limit < 1 || this.limit > 100) {
      throw new Error('Limit must be between 1 and 100');
    }
  }
}

export class GetCurrencyRiskProfilesQuery {
  constructor(data) {
    this.currencyCode = data.currencyCode;
    this.riskLevel = data.riskLevel; // 'low', 'medium', 'high', 'critical'
    this.sanctionsStatus = data.sanctionsStatus;
    this.minVolatilityIndex = data.minVolatilityIndex;
    this.maxVolatilityIndex = data.maxVolatilityIndex;
    this.minLiquidityScore = data.minLiquidityScore;
    this.maxLiquidityScore = data.maxLiquidityScore;
    this.includeRegulatoryFlags = data.includeRegulatoryFlags || false;
    this.page = data.page || 1;
    this.limit = data.limit || 20;
    this.sortBy = data.sortBy || 'currencyCode';
    this.sortOrder = data.sortOrder || 'asc';
    this.metadata = data.metadata || {};
  }

  validate() {
    if (this.currencyCode && !/^[A-Z]{3}$/.test(this.currencyCode)) {
      throw new Error('Currency code must be a valid 3-letter currency code');
    }

    const validRiskLevels = ['low', 'medium', 'high', 'critical'];
    if (this.riskLevel && !validRiskLevels.includes(this.riskLevel)) {
      throw new Error(`Invalid risk level: ${this.riskLevel}`);
    }

    const validSanctionsStatuses = ['clear', 'sanctioned', 'restricted', 'monitoring'];
    if (this.sanctionsStatus && !validSanctionsStatuses.includes(this.sanctionsStatus)) {
      throw new Error(`Invalid sanctions status: ${this.sanctionsStatus}`);
    }

    if (this.minVolatilityIndex && this.maxVolatilityIndex && this.minVolatilityIndex > this.maxVolatilityIndex) {
      throw new Error('Min volatility index cannot be greater than max volatility index');
    }

    if (this.minLiquidityScore && this.maxLiquidityScore && this.minLiquidityScore > this.maxLiquidityScore) {
      throw new Error('Min liquidity score cannot be greater than max liquidity score');
    }

    const validSortFields = ['currencyCode', 'riskLevel', 'volatilityIndex', 'liquidityScore'];
    if (!validSortFields.includes(this.sortBy)) {
      throw new Error(`Invalid sort field: ${this.sortBy}`);
    }

    if (!['asc', 'desc'].includes(this.sortOrder)) {
      throw new Error('Sort order must be asc or desc');
    }

    if (this.page < 1) {
      throw new Error('Page must be greater than 0');
    }
    if (this.limit < 1 || this.limit > 100) {
      throw new Error('Limit must be between 1 and 100');
    }
  }
}

export class GetCurrencyComplianceReportsQuery {
  constructor(data) {
    this.currencyCode = data.currencyCode;
    this.userId = data.userId;
    this.conversionId = data.conversionId;
    this.complianceStatus = data.complianceStatus; // 'passed', 'failed', 'pending'
    this.checkType = data.checkType;
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.minRiskScore = data.minRiskScore;
    this.maxRiskScore = data.maxRiskScore;
    this.page = data.page || 1;
    this.limit = data.limit || 20;
    this.sortBy = data.sortBy || 'timestamp';
    this.sortOrder = data.sortOrder || 'desc';
    this.metadata = data.metadata || {};
  }

  validate() {
    if (this.currencyCode && !/^[A-Z]{3}$/.test(this.currencyCode)) {
      throw new Error('Currency code must be a valid 3-letter currency code');
    }

    const validStatuses = ['passed', 'failed', 'pending'];
    if (this.complianceStatus && !validStatuses.includes(this.complianceStatus)) {
      throw new Error(`Invalid compliance status: ${this.complianceStatus}`);
    }

    const validCheckTypes = ['sanctions', 'aml', 'transaction_limits', 'geographic_restrictions', 'currency_restrictions'];
    if (this.checkType && !validCheckTypes.includes(this.checkType)) {
      throw new Error(`Invalid check type: ${this.checkType}`);
    }

    if (this.startDate && this.endDate) {
      const start = new Date(this.startDate);
      const end = new Date(this.endDate);
      if (start > end) {
        throw new Error('Start date cannot be after end date');
      }
    }

    if (this.minRiskScore && this.maxRiskScore && this.minRiskScore > this.maxRiskScore) {
      throw new Error('Min risk score cannot be greater than max risk score');
    }

    const validSortFields = ['timestamp', 'complianceStatus', 'riskScore', 'checkType'];
    if (!validSortFields.includes(this.sortBy)) {
      throw new Error(`Invalid sort field: ${this.sortBy}`);
    }

    if (!['asc', 'desc'].includes(this.sortOrder)) {
      throw new Error('Sort order must be asc or desc');
    }

    if (this.page < 1) {
      throw new Error('Page must be greater than 0');
    }
    if (this.limit < 1 || this.limit > 100) {
      throw new Error('Limit must be between 1 and 100');
    }
  }
}

export class GetCurrencyFraudAlertsQuery {
  constructor(data) {
    this.alertId = data.alertId;
    this.fraudType = data.fraudType;
    this.severity = data.severity; // 'low', 'medium', 'high', 'critical'
    this.status = data.status || 'active'; // 'active', 'investigating', 'resolved', 'dismissed'
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.affectedUserId = data.affectedUserId;
    this.escalationRequired = data.escalationRequired;
    this.page = data.page || 1;
    this.limit = data.limit || 20;
    this.sortBy = data.sortBy || 'timestamp';
    this.sortOrder = data.sortOrder || 'desc';
    this.metadata = data.metadata || {};
  }

  validate() {
    const validSeverities = ['low', 'medium', 'high', 'critical'];
    if (this.severity && !validSeverities.includes(this.severity)) {
      throw new Error(`Invalid severity: ${this.severity}`);
    }

    const validStatuses = ['active', 'investigating', 'resolved', 'dismissed'];
    if (!validStatuses.includes(this.status)) {
      throw new Error(`Invalid status: ${this.status}`);
    }

    const validFraudTypes = [
      'money_laundering', 'sanctions_evasion', 'fraudulent_conversion',
      'unusual_volume', 'structured_transactions', 'black_market_exchange'
    ];

    if (this.fraudType && !validFraudTypes.includes(this.fraudType)) {
      throw new Error(`Invalid fraud type: ${this.fraudType}`);
    }

    if (this.startDate && this.endDate) {
      const start = new Date(this.startDate);
      const end = new Date(this.endDate);
      if (start > end) {
        throw new Error('Start date cannot be after end date');
      }
    }

    const validSortFields = ['timestamp', 'severity', 'fraudType', 'status'];
    if (!validSortFields.includes(this.sortBy)) {
      throw new Error(`Invalid sort field: ${this.sortBy}`);
    }

    if (!['asc', 'desc'].includes(this.sortOrder)) {
      throw new Error('Sort order must be asc or desc');
    }

    if (this.page < 1) {
      throw new Error('Page must be greater than 0');
    }
    if (this.limit < 1 || this.limit > 100) {
      throw new Error('Limit must be between 1 and 100');
    }
  }
}

export class GetCurrencyExposureAnalysisQuery {
  constructor(data) {
    this.currencyCode = data.currencyCode;
    this.userId = data.userId;
    this.portfolioId = data.portfolioId;
    this.timeframe = data.timeframe || '30d'; // '1d', '7d', '30d', '90d', '1y'
    this.includeHedging = data.includeHedging || false;
    this.riskMetrics = data.riskMetrics || ['var', 'cvar', 'beta', 'correlation'];
    this.groupBy = data.groupBy || 'currency'; // 'currency', 'region', 'type'
    this.metadata = data.metadata || {};
  }

  validate() {
    if (this.currencyCode && !/^[A-Z]{3}$/.test(this.currencyCode)) {
      throw new Error('Currency code must be a valid 3-letter currency code');
    }

    const validTimeframes = ['1d', '7d', '30d', '90d', '1y'];
    if (!validTimeframes.includes(this.timeframe)) {
      throw new Error(`Invalid timeframe: ${this.timeframe}`);
    }

    const validRiskMetrics = ['var', 'cvar', 'beta', 'correlation', 'volatility', 'sharpe_ratio'];
    for (const metric of this.riskMetrics) {
      if (!validRiskMetrics.includes(metric)) {
        throw new Error(`Invalid risk metric: ${metric}`);
      }
    }

    const validGroupBy = ['currency', 'region', 'type', 'user'];
    if (!validGroupBy.includes(this.groupBy)) {
      throw new Error(`Invalid group by: ${this.groupBy}`);
    }
  }
}