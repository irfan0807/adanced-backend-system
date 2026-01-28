import { v4 as uuidv4 } from 'uuid';

export class ExchangeRatesUpdatedEvent {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.baseCurrency = data.baseCurrency;
    this.rates = data.rates || {};
    this.source = data.source || 'external_api';
    this.updateType = data.updateType || 'full';
    this.previousRates = data.previousRates || {};
    this.changes = data.changes || {};
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventType = 'EXCHANGE_RATES_UPDATED';
    this.version = 1;
  }
}

export class CurrencyConvertedEvent {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.fromCurrency = data.fromCurrency;
    this.toCurrency = data.toCurrency;
    this.amount = data.amount;
    this.convertedAmount = data.convertedAmount;
    this.exchangeRate = data.exchangeRate;
    this.userId = data.userId;
    this.purpose = data.purpose || 'conversion';
    this.fee = data.fee || 0;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventType = 'CURRENCY_CONVERTED';
    this.version = 1;
  }
}

export class CurrencyAddedEvent {
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
    this.eventType = 'CURRENCY_ADDED';
    this.version = 1;
  }
}

export class CurrencyRemovedEvent {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.currencyCode = data.currencyCode;
    this.currencyName = data.currencyName;
    this.removedBy = data.removedBy;
    this.reason = data.reason;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventType = 'CURRENCY_REMOVED';
    this.version = 1;
  }
}

export class CurrencySettingsUpdatedEvent {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.currencyCode = data.currencyCode;
    this.updates = data.updates || {};
    this.previousSettings = data.previousSettings || {};
    this.updatedBy = data.updatedBy;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventType = 'CURRENCY_SETTINGS_UPDATED';
    this.version = 1;
  }
}

export class ExchangeRatesRefreshFailedEvent {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.source = data.source || 'external_api';
    this.error = data.error;
    this.lastSuccessfulUpdate = data.lastSuccessfulUpdate;
    this.attemptCount = data.attemptCount || 1;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventType = 'EXCHANGE_RATES_REFRESH_FAILED';
    this.version = 1;
  }
}

export class BaseCurrencyChangedEvent {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.newBaseCurrency = data.newBaseCurrency;
    this.previousBaseCurrency = data.previousBaseCurrency;
    this.setBy = data.setBy;
    this.reason = data.reason;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventType = 'BASE_CURRENCY_CHANGED';
    this.version = 1;
  }
}

export class CurrencyRateAlertTriggeredEvent {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.currencyPair = data.currencyPair;
    this.currentRate = data.currentRate;
    this.thresholdRate = data.thresholdRate;
    this.alertType = data.alertType; // 'above' or 'below'
    this.alertId = data.alertId;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventType = 'CURRENCY_RATE_ALERT_TRIGGERED';
    this.version = 1;
  }
}

export class CurrencyServiceHealthCheckEvent {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.status = data.status; // 'healthy', 'degraded', 'unhealthy'
    this.lastRateUpdate = data.lastRateUpdate;
    this.activeCurrencies = data.activeCurrencies || [];
    this.cacheSize = data.cacheSize || 0;
    this.errors = data.errors || [];
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventType = 'CURRENCY_SERVICE_HEALTH_CHECK';
    this.version = 1;
  }
}

export class ExchangeRateSourceChangedEvent {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.newSource = data.newSource;
    this.previousSource = data.previousSource;
    this.changedBy = data.changedBy;
    this.reason = data.reason;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventType = 'EXCHANGE_RATE_SOURCE_CHANGED';
    this.version = 1;
  }
}

export class BulkCurrencyUpdateEvent {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.updates = data.updates || [];
    this.updateCount = data.updateCount || 0;
    this.source = data.source || 'system';
    this.initiatedBy = data.initiatedBy;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventType = 'BULK_CURRENCY_UPDATE';
    this.version = 1;
  }
}

export class BulkExchangeRatesUpdatedEvent {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.batchId = data.batchId;
    this.updates = data.updates || [];
    this.totalUpdates = data.totalUpdates || 0;
    this.successfulUpdates = data.successfulUpdates || 0;
    this.failedUpdates = data.failedUpdates || 0;
    this.source = data.source || 'bulk_update';
    this.requestedBy = data.requestedBy;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventType = 'BULK_EXCHANGE_RATES_UPDATED';
    this.version = 1;
  }
}

export class BulkCurrencyConversionCompletedEvent {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.batchId = data.batchId;
    this.conversions = data.conversions || [];
    this.totalConversions = data.totalConversions || 0;
    this.successfulConversions = data.successfulConversions || 0;
    this.failedConversions = data.failedConversions || 0;
    this.totalAmount = data.totalAmount || 0;
    this.userId = data.userId;
    this.purpose = data.purpose || 'bulk_conversion';
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventType = 'BULK_CURRENCY_CONVERSION_COMPLETED';
    this.version = 1;
  }
}

export class CurrencyDataArchivedEvent {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.criteria = data.criteria || {};
    this.archiveTo = data.archiveTo || 'cold_storage';
    this.retentionPeriod = data.retentionPeriod || 2555;
    this.recordsArchived = data.recordsArchived || 0;
    this.archiveSize = data.archiveSize || 0;
    this.compression = data.compression || 'gzip';
    this.encryption = data.encryption || 'aes256';
    this.requestedBy = data.requestedBy;
    this.reason = data.reason;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventType = 'CURRENCY_DATA_ARCHIVED';
    this.version = 1;
  }
}

export class CurrencyDataPurgedEvent {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.criteria = data.criteria || {};
    this.olderThan = data.olderThan;
    this.recordsPurged = data.recordsPurged || 0;
    this.dataSizePurged = data.dataSizePurged || 0;
    this.forceDelete = data.forceDelete || false;
    this.backupCreated = data.backupCreated || false;
    this.approvedBy = data.approvedBy;
    this.complianceApproval = data.complianceApproval;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventType = 'CURRENCY_DATA_PURGED';
    this.version = 1;
  }
}

export class SuspiciousCurrencyActivityFlaggedEvent {
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
    this.eventType = 'SUSPICIOUS_CURRENCY_ACTIVITY_FLAGGED';
    this.version = 1;
  }
}

export class CurrencyReportGeneratedEvent {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.reportId = data.reportId || uuidv4();
    this.reportType = data.reportType;
    this.parameters = data.parameters || {};
    this.filters = data.filters || {};
    this.format = data.format || 'json';
    this.recordCount = data.recordCount || 0;
    this.fileSize = data.fileSize || 0;
    this.generationTime = data.generationTime || 0;
    this.includeCompliance = data.includeCompliance || true;
    this.includeRiskAnalysis = data.includeRiskAnalysis || false;
    this.generatedBy = data.generatedBy;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventType = 'CURRENCY_REPORT_GENERATED';
    this.version = 1;
  }
}

export class CurrencyRetentionPolicyUpdatedEvent {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.policyId = data.policyId;
    this.name = data.name;
    this.description = data.description;
    this.retentionRules = data.retentionRules || [];
    this.complianceRequirements = data.complianceRequirements || [];
    this.autoArchive = data.autoArchive || true;
    this.autoPurge = data.autoPurge || false;
    this.notificationSettings = data.notificationSettings || {};
    this.approvedBy = data.approvedBy;
    this.effectiveDate = data.effectiveDate;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventType = 'CURRENCY_RETENTION_POLICY_UPDATED';
    this.version = 1;
  }
}

export class CurrencyAlertCreatedEvent {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.alertId = data.alertId || uuidv4();
    this.alertType = data.alertType;
    this.currencyPair = data.currencyPair;
    this.condition = data.condition;
    this.threshold = data.threshold;
    this.userId = data.userId;
    this.notificationChannels = data.notificationChannels || ['email'];
    this.isActive = data.isActive !== false;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventType = 'CURRENCY_ALERT_CREATED';
    this.version = 1;
  }
}

export class CurrencyRiskProfileUpdatedEvent {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.currencyCode = data.currencyCode;
    this.riskLevel = data.riskLevel;
    this.previousRiskLevel = data.previousRiskLevel;
    this.volatilityIndex = data.volatilityIndex;
    this.liquidityScore = data.liquidityScore;
    this.regulatoryFlags = data.regulatoryFlags || [];
    this.sanctionsStatus = data.sanctionsStatus || 'clear';
    this.updatedBy = data.updatedBy;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventType = 'CURRENCY_RISK_PROFILE_UPDATED';
    this.version = 1;
  }
}

export class CurrencyComplianceCheckEvent {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.checkType = data.checkType;
    this.currencyCode = data.currencyCode;
    this.userId = data.userId;
    this.conversionId = data.conversionId;
    this.complianceStatus = data.complianceStatus; // 'passed', 'failed', 'pending'
    this.violations = data.violations || [];
    this.riskScore = data.riskScore || 0;
    this.requiredActions = data.requiredActions || [];
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventType = 'CURRENCY_COMPLIANCE_CHECK';
    this.version = 1;
  }
}

export class CurrencyFraudAlertEvent {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.alertId = data.alertId || uuidv4();
    this.fraudType = data.fraudType;
    this.severity = data.severity || 'medium';
    this.affectedUsers = data.affectedUsers || [];
    this.affectedConversions = data.affectedConversions || [];
    this.indicators = data.indicators || [];
    this.recommendedActions = data.recommendedActions || [];
    this.escalationRequired = data.escalationRequired || false;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date().toISOString();
    this.eventType = 'CURRENCY_FRAUD_ALERT';
    this.version = 1;
  }
}