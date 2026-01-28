import { v4 as uuidv4 } from 'uuid';

export class UpdateExchangeRatesCommand {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.baseCurrency = data.baseCurrency;
    this.rates = data.rates || {};
    this.source = data.source || 'external_api';
    this.updateType = data.updateType || 'full'; // 'full' or 'partial'
    this.requestedBy = data.requestedBy;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
  }

  validate() {
    if (!this.baseCurrency) {
      throw new Error('Base currency is required');
    }
    if (!this.rates || Object.keys(this.rates).length === 0) {
      throw new Error('Exchange rates are required');
    }
    if (!['full', 'partial'].includes(this.updateType)) {
      throw new Error('Update type must be full or partial');
    }

    // Validate currency codes (3-letter uppercase)
    const currencyRegex = /^[A-Z]{3}$/;
    if (!currencyRegex.test(this.baseCurrency)) {
      throw new Error('Base currency must be a valid 3-letter currency code');
    }

    for (const [currency, rate] of Object.entries(this.rates)) {
      if (!currencyRegex.test(currency)) {
        throw new Error(`Invalid currency code: ${currency}`);
      }
      if (typeof rate !== 'number' || rate <= 0) {
        throw new Error(`Invalid exchange rate for ${currency}: ${rate}`);
      }
    }
  }
}

export class ConvertCurrencyCommand {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.fromCurrency = data.fromCurrency;
    this.toCurrency = data.toCurrency;
    this.amount = data.amount;
    this.userId = data.userId;
    this.purpose = data.purpose || 'conversion';
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
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

    if (this.fromCurrency === this.toCurrency) {
      throw new Error('From and to currencies cannot be the same');
    }
  }
}

export class AddCurrencyCommand {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.currencyCode = data.currencyCode;
    this.currencyName = data.currencyName;
    this.symbol = data.symbol;
    this.decimalPlaces = data.decimalPlaces || 2;
    this.isActive = data.isActive !== false;
    this.addedBy = data.addedBy;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
  }

  validate() {
    if (!this.currencyCode) {
      throw new Error('Currency code is required');
    }
    if (!this.currencyName) {
      throw new Error('Currency name is required');
    }

    const currencyRegex = /^[A-Z]{3}$/;
    if (!currencyRegex.test(this.currencyCode)) {
      throw new Error('Currency code must be a valid 3-letter uppercase code');
    }

    if (this.decimalPlaces < 0 || this.decimalPlaces > 8) {
      throw new Error('Decimal places must be between 0 and 8');
    }
  }
}

export class RemoveCurrencyCommand {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.currencyCode = data.currencyCode;
    this.removedBy = data.removedBy;
    this.reason = data.reason;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
  }

  validate() {
    if (!this.currencyCode) {
      throw new Error('Currency code is required');
    }

    const currencyRegex = /^[A-Z]{3}$/;
    if (!currencyRegex.test(this.currencyCode)) {
      throw new Error('Currency code must be a valid 3-letter uppercase code');
    }
  }
}

export class UpdateCurrencySettingsCommand {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.currencyCode = data.currencyCode;
    this.updates = data.updates || {};
    this.updatedBy = data.updatedBy;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
  }

  validate() {
    if (!this.currencyCode) {
      throw new Error('Currency code is required');
    }
    if (!this.updates || Object.keys(this.updates).length === 0) {
      throw new Error('Updates are required');
    }

    const currencyRegex = /^[A-Z]{3}$/;
    if (!currencyRegex.test(this.currencyCode)) {
      throw new Error('Currency code must be a valid 3-letter uppercase code');
    }

    const allowedUpdates = ['currencyName', 'symbol', 'decimalPlaces', 'isActive', 'exchangeRateSource'];
    const invalidUpdates = Object.keys(this.updates).filter(key => !allowedUpdates.includes(key));
    if (invalidUpdates.length > 0) {
      throw new Error(`Invalid update fields: ${invalidUpdates.join(', ')}`);
    }
  }
}

export class RefreshExchangeRatesCommand {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.source = data.source || 'external_api';
    this.forceRefresh = data.forceRefresh || false;
    this.requestedBy = data.requestedBy;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
  }

  validate() {
    const validSources = ['external_api', 'manual', 'fallback'];
    if (!validSources.includes(this.source)) {
      throw new Error(`Invalid source: ${this.source}. Must be one of: ${validSources.join(', ')}`);
    }
  }
}

export class SetBaseCurrencyCommand {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.currencyCode = data.currencyCode;
    this.setBy = data.setBy;
    this.reason = data.reason;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
  }

  validate() {
    if (!this.currencyCode) {
      throw new Error('Currency code is required');
    }
    if (!this.setBy) {
      throw new Error('Set by is required');
    }

    const currencyRegex = /^[A-Z]{3}$/;
    if (!currencyRegex.test(this.currencyCode)) {
      throw new Error('Currency code must be a valid 3-letter currency code');
    }
  }
}

export class BulkUpdateExchangeRatesCommand {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.updates = data.updates || []; // Array of {baseCurrency, rates, source}
    this.batchId = data.batchId || uuidv4();
    this.source = data.source || 'bulk_update';
    this.requestedBy = data.requestedBy;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
  }

  validate() {
    if (!Array.isArray(this.updates) || this.updates.length === 0) {
      throw new Error('Updates array is required and cannot be empty');
    }

    if (this.updates.length > 50) {
      throw new Error('Maximum 50 currency updates per batch');
    }

    this.updates.forEach((update, index) => {
      if (!update.baseCurrency || !update.rates) {
        throw new Error(`Invalid update at index ${index}: baseCurrency and rates are required`);
      }
    });
  }
}

export class BulkConvertCurrenciesCommand {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.conversions = data.conversions || []; // Array of conversion requests
    this.batchId = data.batchId || uuidv4();
    this.userId = data.userId;
    this.purpose = data.purpose || 'bulk_conversion';
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
  }

  validate() {
    if (!Array.isArray(this.conversions) || this.conversions.length === 0) {
      throw new Error('Conversions array is required and cannot be empty');
    }

    if (this.conversions.length > 100) {
      throw new Error('Maximum 100 conversions per batch');
    }

    this.conversions.forEach((conversion, index) => {
      if (!conversion.fromCurrency || !conversion.toCurrency || !conversion.amount) {
        throw new Error(`Invalid conversion at index ${index}: fromCurrency, toCurrency, and amount are required`);
      }
    });
  }
}

export class ArchiveCurrencyDataCommand {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.criteria = data.criteria || {};
    this.archiveTo = data.archiveTo || 'cold_storage';
    this.retentionPeriod = data.retentionPeriod || 2555; // days
    this.compression = data.compression || 'gzip';
    this.encryption = data.encryption || 'aes256';
    this.requestedBy = data.requestedBy;
    this.reason = data.reason;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
  }

  validate() {
    if (!this.requestedBy) {
      throw new Error('Requested by is required');
    }
    if (!this.reason) {
      throw new Error('Reason for archiving is required');
    }

    const validArchives = ['cold_storage', 'external_backup', 'compliance_vault'];
    if (!validArchives.includes(this.archiveTo)) {
      throw new Error(`Invalid archive destination: ${this.archiveTo}`);
    }
  }
}

export class PurgeCurrencyDataCommand {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.criteria = data.criteria || {};
    this.olderThan = data.olderThan; // ISO date string
    this.forceDelete = data.forceDelete || false;
    this.backupFirst = data.backupFirst || true;
    this.approvedBy = data.approvedBy;
    this.complianceApproval = data.complianceApproval;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
  }

  validate() {
    if (!this.olderThan) {
      throw new Error('Older than date is required');
    }
    if (!this.approvedBy) {
      throw new Error('Approval authority is required');
    }

    const olderThanDate = new Date(this.olderThan);
    if (isNaN(olderThanDate.getTime())) {
      throw new Error('Invalid older than date format');
    }

    // Must be at least 7 years old for compliance
    const sevenYearsAgo = new Date();
    sevenYearsAgo.setFullYear(sevenYearsAgo.getFullYear() - 7);
    if (olderThanDate > sevenYearsAgo) {
      throw new Error('Cannot purge data less than 7 years old without special approval');
    }
  }
}

export class FlagSuspiciousCurrencyActivityCommand {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.conversionId = data.conversionId;
    this.userId = data.userId;
    this.activityType = data.activityType;
    this.severity = data.severity || 'medium';
    this.indicators = data.indicators || [];
    this.riskScore = data.riskScore || 0;
    this.automaticAction = data.automaticAction;
    this.requiresReview = data.requiresReview || true;
    this.escalationLevel = data.escalationLevel || 1;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
  }

  validate() {
    if (!this.conversionId && !this.userId) {
      throw new Error('Either conversion ID or user ID is required');
    }
    if (!this.activityType) {
      throw new Error('Activity type is required');
    }

    const validSeverities = ['low', 'medium', 'high', 'critical'];
    if (!validSeverities.includes(this.severity)) {
      throw new Error(`Invalid severity: ${this.severity}`);
    }

    const validActivities = [
      'unusual_conversion_amount', 'rapid_conversions', 'circular_trading',
      'blacklisted_currency', 'suspicious_timing', 'unusual_location',
      'bulk_small_conversions', 'round_number_conversions', 'frequent_rate_checks'
    ];

    if (!validActivities.includes(this.activityType)) {
      throw new Error(`Invalid activity type: ${this.activityType}`);
    }
  }
}

export class GenerateCurrencyReportCommand {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.reportType = data.reportType;
    this.parameters = data.parameters || {};
    this.filters = data.filters || {};
    this.format = data.format || 'json';
    this.includeCompliance = data.includeCompliance || true;
    this.includeRiskAnalysis = data.includeRiskAnalysis || false;
    this.timeRange = data.timeRange || {};
    this.generatedBy = data.generatedBy;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
  }

  validate() {
    if (!this.reportType) {
      throw new Error('Report type is required');
    }
    if (!this.generatedBy) {
      throw new Error('Generated by is required');
    }

    const validTypes = [
      'conversion-summary', 'exchange-rate-analysis', 'currency-exposure',
      'regulatory-compliance', 'fraud-analysis', 'revenue-report',
      'user-activity', 'market-volatility', 'custom-currency'
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

export class UpdateCurrencyRetentionPolicyCommand {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.policyId = data.policyId || uuidv4();
    this.name = data.name;
    this.description = data.description;
    this.retentionRules = data.retentionRules || [];
    this.complianceRequirements = data.complianceRequirements || [];
    this.autoArchive = data.autoArchive || true;
    this.autoPurge = data.autoPurge || false;
    this.notificationSettings = data.notificationSettings || {};
    this.approvedBy = data.approvedBy;
    this.effectiveDate = data.effectiveDate || new Date().toISOString();
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
  }

  validate() {
    if (!this.name) {
      throw new Error('Policy name is required');
    }
    if (!this.approvedBy) {
      throw new Error('Approval authority is required');
    }
    if (!Array.isArray(this.retentionRules) || this.retentionRules.length === 0) {
      throw new Error('Retention rules are required');
    }

    this.retentionRules.forEach((rule, index) => {
      if (!rule.dataType || !rule.retentionDays) {
        throw new Error(`Invalid retention rule at index ${index}`);
      }
    });
  }
}

export class CreateCurrencyAlertCommand {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.alertType = data.alertType;
    this.currencyPair = data.currencyPair;
    this.condition = data.condition;
    this.threshold = data.threshold;
    this.userId = data.userId;
    this.notificationChannels = data.notificationChannels || ['email'];
    this.isActive = data.isActive !== false;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
  }

  validate() {
    if (!this.alertType) {
      throw new Error('Alert type is required');
    }
    if (!this.currencyPair) {
      throw new Error('Currency pair is required');
    }
    if (!this.condition) {
      throw new Error('Condition is required');
    }
    if (typeof this.threshold !== 'number') {
      throw new Error('Threshold must be a number');
    }

    const validTypes = ['rate_change', 'rate_threshold', 'volatility', 'conversion_volume'];
    if (!validTypes.includes(this.alertType)) {
      throw new Error(`Invalid alert type: ${this.alertType}`);
    }

    const validConditions = ['above', 'below', 'change_percent', 'volatility_spike'];
    if (!validConditions.includes(this.condition)) {
      throw new Error(`Invalid condition: ${this.condition}`);
    }
  }
}

export class UpdateCurrencyRiskProfileCommand {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.currencyCode = data.currencyCode;
    this.riskLevel = data.riskLevel;
    this.volatilityIndex = data.volatilityIndex;
    this.liquidityScore = data.liquidityScore;
    this.regulatoryFlags = data.regulatoryFlags || [];
    this.sanctionsStatus = data.sanctionsStatus || 'clear';
    this.updatedBy = data.updatedBy;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
  }

  validate() {
    if (!this.currencyCode) {
      throw new Error('Currency code is required');
    }
    if (!this.riskLevel) {
      throw new Error('Risk level is required');
    }
    if (!this.updatedBy) {
      throw new Error('Updated by is required');
    }

    const validRiskLevels = ['low', 'medium', 'high', 'critical'];
    if (!validRiskLevels.includes(this.riskLevel)) {
      throw new Error(`Invalid risk level: ${this.riskLevel}`);
    }

    const currencyRegex = /^[A-Z]{3}$/;
    if (!currencyRegex.test(this.currencyCode)) {
      throw new Error('Currency code must be a valid 3-letter currency code');
    }
  }
}