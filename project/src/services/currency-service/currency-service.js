import { CommandBus } from '../../../shared/cqrs/command-bus.js';
import { QueryBus } from '../../../shared/cqrs/query-bus.js';
import { EventStore } from '../../../shared/event-sourcing/event-store.js';
import { DualWriter } from '../../../shared/database/dual-writer.js';
import { KafkaService } from '../../../shared/messaging/kafka-service.js';
import { ConnectionPool } from '../../../shared/database/connection-pool.js';
import { Logger } from '../../../shared/logging/logger.js';

import { CurrencyCommandHandler } from './handlers/currency-command-handler.js';
import { CurrencyQueryHandler } from './handlers/currency-query-handler.js';

import {
  UpdateExchangeRatesCommand,
  ConvertCurrencyCommand,
  AddCurrencyCommand,
  RemoveCurrencyCommand,
  UpdateCurrencySettingsCommand,
  RefreshExchangeRatesCommand,
  SetBaseCurrencyCommand,
  BulkUpdateExchangeRatesCommand,
  BulkConvertCurrenciesCommand,
  ArchiveCurrencyDataCommand,
  PurgeCurrencyDataCommand,
  FlagSuspiciousCurrencyActivityCommand,
  GenerateCurrencyReportCommand,
  UpdateCurrencyRetentionPolicyCommand,
  CreateCurrencyAlertCommand,
  UpdateCurrencyRiskProfileCommand
} from '../commands/currency-commands.js';

import {
  GetExchangeRatesQuery,
  GetCurrencyConversionQuery,
  GetCurrencyListQuery,
  GetExchangeRateHistoryQuery,
  GetCurrencyAnalyticsQuery,
  GetConversionAnalyticsQuery,
  GetCurrencySettingsQuery,
  GetBaseCurrencyQuery,
  GetSupportedCurrenciesQuery,
  GetCurrencyServiceHealthQuery,
  GetBulkCurrencyUpdatesQuery,
  GetArchivedCurrencyDataQuery,
  GetSuspiciousCurrencyActivitiesQuery,
  GetCurrencyReportsQuery,
  GetCurrencyRetentionPoliciesQuery,
  GetCurrencyRiskProfilesQuery,
  GetCurrencyComplianceReportsQuery,
  GetCurrencyFraudAlertsQuery,
  GetCurrencyExposureAnalysisQuery
} from '../queries/currency-queries.js';

export class CurrencyService {
  constructor(config = {}) {
    this.config = {
      kafka: config.kafka || {},
      database: config.database || {},
      eventStore: config.eventStore || {},
      externalApi: config.externalApi || {},
      ...config
    };

    this.logger = new Logger('CurrencyService');
    this.connectionPool = new ConnectionPool(this.config.database);
    this.dualWriter = new DualWriter(this.connectionPool);
    this.eventStore = new EventStore(this.config.eventStore);
    this.kafkaService = new KafkaService(this.config.kafka);

    this.commandBus = new CommandBus();
    this.queryBus = new QueryBus();

    this.commandHandler = new CurrencyCommandHandler({
      connectionPool: this.connectionPool,
      dualWriter: this.dualWriter,
      eventStore: this.eventStore,
      kafkaService: this.kafkaService,
      logger: this.logger,
      externalApiService: this.externalApiService
    });

    this.queryHandler = new CurrencyQueryHandler({
      connectionPool: this.connectionPool,
      dualWriter: this.dualWriter,
      eventStore: this.eventStore,
      logger: this.logger
    });

    this.externalApiService = config.externalApiService || null;
    this.isInitialized = false;
  }

  async initialize() {
    try {
      this.logger.info('Initializing Currency Service...');

      // Initialize database connections
      await this.connectionPool.initialize();
      await this.dualWriter.initialize();

      // Initialize event store
      await this.eventStore.initialize();

      // Initialize Kafka service
      await this.kafkaService.initialize();

      // Register command handlers
      this.commandBus.registerHandler(UpdateExchangeRatesCommand.name, this.commandHandler);
      this.commandBus.registerHandler(ConvertCurrencyCommand.name, this.commandHandler);
      this.commandBus.registerHandler(AddCurrencyCommand.name, this.commandHandler);
      this.commandBus.registerHandler(RemoveCurrencyCommand.name, this.commandHandler);
      this.commandBus.registerHandler(UpdateCurrencySettingsCommand.name, this.commandHandler);
      this.commandBus.registerHandler(RefreshExchangeRatesCommand.name, this.commandHandler);
      this.commandBus.registerHandler(SetBaseCurrencyCommand.name, this.commandHandler);
      this.commandBus.registerHandler(BulkUpdateExchangeRatesCommand.name, this.commandHandler);
      this.commandBus.registerHandler(BulkConvertCurrenciesCommand.name, this.commandHandler);
      this.commandBus.registerHandler(ArchiveCurrencyDataCommand.name, this.commandHandler);
      this.commandBus.registerHandler(PurgeCurrencyDataCommand.name, this.commandHandler);
      this.commandBus.registerHandler(FlagSuspiciousCurrencyActivityCommand.name, this.commandHandler);
      this.commandBus.registerHandler(GenerateCurrencyReportCommand.name, this.commandHandler);
      this.commandBus.registerHandler(UpdateCurrencyRetentionPolicyCommand.name, this.commandHandler);
      this.commandBus.registerHandler(CreateCurrencyAlertCommand.name, this.commandHandler);
      this.commandBus.registerHandler(UpdateCurrencyRiskProfileCommand.name, this.commandHandler);

      // Register query handlers
      this.queryBus.registerHandler(GetExchangeRatesQuery.name, this.queryHandler);
      this.queryBus.registerHandler(GetCurrencyConversionQuery.name, this.queryHandler);
      this.queryBus.registerHandler(GetCurrencyListQuery.name, this.queryHandler);
      this.queryBus.registerHandler(GetExchangeRateHistoryQuery.name, this.queryHandler);
      this.queryBus.registerHandler(GetCurrencyAnalyticsQuery.name, this.queryHandler);
      this.queryBus.registerHandler(GetConversionAnalyticsQuery.name, this.queryHandler);
      this.queryBus.registerHandler(GetCurrencySettingsQuery.name, this.queryHandler);
      this.queryBus.registerHandler(GetBaseCurrencyQuery.name, this.queryHandler);
      this.queryBus.registerHandler(GetSupportedCurrenciesQuery.name, this.queryHandler);
      this.queryBus.registerHandler(GetCurrencyServiceHealthQuery.name, this.queryHandler);
      this.queryBus.registerHandler(GetBulkCurrencyUpdatesQuery.name, this.queryHandler);
      this.queryBus.registerHandler(GetArchivedCurrencyDataQuery.name, this.queryHandler);
      this.queryBus.registerHandler(GetSuspiciousCurrencyActivitiesQuery.name, this.queryHandler);
      this.queryBus.registerHandler(GetCurrencyReportsQuery.name, this.queryHandler);
      this.queryBus.registerHandler(GetCurrencyRetentionPoliciesQuery.name, this.queryHandler);
      this.queryBus.registerHandler(GetCurrencyRiskProfilesQuery.name, this.queryHandler);
      this.queryBus.registerHandler(GetCurrencyComplianceReportsQuery.name, this.queryHandler);
      this.queryBus.registerHandler(GetCurrencyFraudAlertsQuery.name, this.queryHandler);
      this.queryBus.registerHandler(GetCurrencyExposureAnalysisQuery.name, this.queryHandler);

      // Initialize database schema if needed
      await this.initializeDatabaseSchema();

      this.isInitialized = true;
      this.logger.info('Currency Service initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize Currency Service:', error);
      throw error;
    }
  }

  async shutdown() {
    try {
      this.logger.info('Shutting down Currency Service...');

      await this.kafkaService.disconnect();
      await this.eventStore.disconnect();
      await this.dualWriter.disconnect();
      await this.connectionPool.disconnect();

      this.isInitialized = false;
      this.logger.info('Currency Service shut down successfully');

    } catch (error) {
      this.logger.error('Error during Currency Service shutdown:', error);
      throw error;
    }
  }

  // Command methods
  async updateExchangeRates(baseCurrency, rates, source = 'manual', requestedBy = 'system', metadata = {}) {
    const command = new UpdateExchangeRatesCommand({
      baseCurrency,
      rates,
      source,
      updateType: 'full',
      requestedBy,
      metadata
    });

    return await this.commandBus.execute(command);
  }

  async convertCurrency(fromCurrency, toCurrency, amount, userId, purpose = 'conversion', metadata = {}) {
    const command = new ConvertCurrencyCommand({
      fromCurrency,
      toCurrency,
      amount,
      userId,
      purpose,
      metadata
    });

    return await this.commandBus.execute(command);
  }

  async addCurrency(currencyCode, currencyName, symbol, decimalPlaces = 2, addedBy = 'system', metadata = {}) {
    const command = new AddCurrencyCommand({
      currencyCode,
      currencyName,
      symbol,
      decimalPlaces,
      isActive: true,
      addedBy,
      metadata
    });

    return await this.commandBus.execute(command);
  }

  async removeCurrency(currencyCode, removedBy = 'system', reason = 'manual_removal', metadata = {}) {
    const command = new RemoveCurrencyCommand({
      currencyCode,
      removedBy,
      reason,
      metadata
    });

    return await this.commandBus.execute(command);
  }

  async updateCurrencySettings(currencyCode, updates, updatedBy = 'system', metadata = {}) {
    const command = new UpdateCurrencySettingsCommand({
      currencyCode,
      updates,
      updatedBy,
      metadata
    });

    return await this.commandBus.execute(command);
  }

  async refreshExchangeRates(source = 'api', requestedBy = 'system', metadata = {}) {
    const command = new RefreshExchangeRatesCommand({
      source,
      requestedBy,
      metadata
    });

    return await this.commandBus.execute(command);
  }

  async setBaseCurrency(currencyCode, setBy = 'system', metadata = {}) {
    const command = new SetBaseCurrencyCommand({
      currencyCode,
      setBy,
      metadata
    });

    return await this.commandBus.execute(command);
  }

  // Query methods
  async getExchangeRates(baseCurrency = 'USD', currencies = null, date = null) {
    const query = new GetExchangeRatesQuery({
      baseCurrency,
      currencies,
      date
    });

    return await this.queryBus.execute(query);
  }

  async getCurrencyConversion(fromCurrency, toCurrency, amount) {
    const query = new GetCurrencyConversionQuery({
      fromCurrency,
      toCurrency,
      amount
    });

    return await this.queryBus.execute(query);
  }

  async getCurrencyList() {
    const query = new GetCurrencyListQuery({});
    return await this.queryBus.execute(query);
  }

  async getExchangeRateHistory(baseCurrency, targetCurrency, startDate, endDate, interval = 'daily') {
    const query = new GetExchangeRateHistoryQuery({
      baseCurrency,
      targetCurrency,
      startDate,
      endDate,
      interval
    });

    return await this.queryBus.execute(query);
  }

  async getCurrencyAnalytics(currencyCode, startDate, endDate) {
    const query = new GetCurrencyAnalyticsQuery({
      currencyCode,
      startDate,
      endDate
    });

    return await this.queryBus.execute(query);
  }

  async getConversionAnalytics(startDate, endDate, groupBy = 'overall') {
    const query = new GetConversionAnalyticsQuery({
      startDate,
      endDate,
      groupBy
    });

    return await this.queryBus.execute(query);
  }

  async getCurrencySettings(currencyCode) {
    const query = new GetCurrencySettingsQuery({
      currencyCode
    });

    return await this.queryBus.execute(query);
  }

  async getBaseCurrency() {
    const query = new GetBaseCurrencyQuery({});
    return await this.queryBus.execute(query);
  }

  async getSupportedCurrencies() {
    const query = new GetSupportedCurrenciesQuery({});
    return await this.queryBus.execute(query);
  }

  async getServiceHealth() {
    const query = new GetCurrencyServiceHealthQuery({});
    return await this.queryBus.execute(query);
  }

  // Advanced command methods
  async bulkUpdateExchangeRates(updates, source = 'bulk_update', requestedBy = 'system', metadata = {}) {
    const command = new BulkUpdateExchangeRatesCommand({
      updates,
      source,
      requestedBy,
      metadata
    });

    return await this.commandBus.execute(command);
  }

  async bulkConvertCurrencies(conversions, userId, purpose = 'bulk_conversion', metadata = {}) {
    const command = new BulkConvertCurrenciesCommand({
      conversions,
      userId,
      purpose,
      metadata
    });

    return await this.commandBus.execute(command);
  }

  async archiveCurrencyData(criteria, archiveTo = 'cold_storage', retentionPeriod = 2555, requestedBy = 'system', reason = 'data_retention', metadata = {}) {
    const command = new ArchiveCurrencyDataCommand({
      criteria,
      archiveTo,
      retentionPeriod,
      requestedBy,
      reason,
      metadata
    });

    return await this.commandBus.execute(command);
  }

  async purgeCurrencyData(criteria, olderThan, approvedBy = 'system', complianceApproval = null, metadata = {}) {
    const command = new PurgeCurrencyDataCommand({
      criteria,
      olderThan,
      approvedBy,
      complianceApproval,
      metadata
    });

    return await this.commandBus.execute(command);
  }

  async flagSuspiciousActivity(conversionId, userId, activityType, severity = 'medium', indicators = [], metadata = {}) {
    const command = new FlagSuspiciousCurrencyActivityCommand({
      conversionId,
      userId,
      activityType,
      severity,
      indicators,
      metadata
    });

    return await this.commandBus.execute(command);
  }

  async generateCurrencyReport(reportType, parameters = {}, filters = {}, format = 'json', generatedBy = 'system', metadata = {}) {
    const command = new GenerateCurrencyReportCommand({
      reportType,
      parameters,
      filters,
      format,
      generatedBy,
      metadata
    });

    return await this.commandBus.execute(command);
  }

  async updateRetentionPolicy(name, retentionRules, approvedBy = 'system', description = '', metadata = {}) {
    const command = new UpdateCurrencyRetentionPolicyCommand({
      name,
      description,
      retentionRules,
      approvedBy,
      metadata
    });

    return await this.commandBus.execute(command);
  }

  async createCurrencyAlert(alertType, currencyPair, condition, threshold, userId, metadata = {}) {
    const command = new CreateCurrencyAlertCommand({
      alertType,
      currencyPair,
      condition,
      threshold,
      userId,
      metadata
    });

    return await this.commandBus.execute(command);
  }

  async updateCurrencyRiskProfile(currencyCode, riskLevel, updatedBy = 'system', metadata = {}) {
    const command = new UpdateCurrencyRiskProfileCommand({
      currencyCode,
      riskLevel,
      updatedBy,
      metadata
    });

    return await this.commandBus.execute(command);
  }

  // Advanced query methods
  async getBulkCurrencyUpdates(batchId = null, source = null, requestedBy = null, startDate = null, endDate = null, page = 1, limit = 20) {
    const query = new GetBulkCurrencyUpdatesQuery({
      batchId,
      source,
      requestedBy,
      startDate,
      endDate,
      page,
      limit
    });

    return await this.queryBus.execute(query);
  }

  async getArchivedCurrencyData(archiveLocation = null, requestedBy = null, startDate = null, endDate = null, page = 1, limit = 20) {
    const query = new GetArchivedCurrencyDataQuery({
      archiveLocation,
      requestedBy,
      startDate,
      endDate,
      page,
      limit
    });

    return await this.queryBus.execute(query);
  }

  async getSuspiciousActivities(conversionId = null, userId = null, activityType = null, severity = null, status = 'all', page = 1, limit = 20) {
    const query = new GetSuspiciousCurrencyActivitiesQuery({
      conversionId,
      userId,
      activityType,
      severity,
      status,
      page,
      limit
    });

    return await this.queryBus.execute(query);
  }

  async getCurrencyReports(reportType = null, generatedBy = null, startDate = null, endDate = null, status = 'all', page = 1, limit = 20) {
    const query = new GetCurrencyReportsQuery({
      reportType,
      generatedBy,
      startDate,
      endDate,
      status,
      page,
      limit
    });

    return await this.queryBus.execute(query);
  }

  async getRetentionPolicies(policyId = null, name = null, approvedBy = null, status = 'active', page = 1, limit = 20) {
    const query = new GetCurrencyRetentionPoliciesQuery({
      policyId,
      name,
      approvedBy,
      status,
      page,
      limit
    });

    return await this.queryBus.execute(query);
  }

  async getCurrencyRiskProfiles(currencyCode = null, riskLevel = null, sanctionsStatus = null, page = 1, limit = 20) {
    const query = new GetCurrencyRiskProfilesQuery({
      currencyCode,
      riskLevel,
      sanctionsStatus,
      page,
      limit
    });

    return await this.queryBus.execute(query);
  }

  async getCurrencyComplianceReports(currencyCode = null, userId = null, complianceStatus = null, checkType = null, page = 1, limit = 20) {
    const query = new GetCurrencyComplianceReportsQuery({
      currencyCode,
      userId,
      complianceStatus,
      checkType,
      page,
      limit
    });

    return await this.queryBus.execute(query);
  }

  async getCurrencyFraudAlerts(fraudType = null, severity = null, status = 'active', affectedUserId = null, page = 1, limit = 20) {
    const query = new GetCurrencyFraudAlertsQuery({
      fraudType,
      severity,
      status,
      affectedUserId,
      page,
      limit
    });

    return await this.queryBus.execute(query);
  }

  async getCurrencyExposureAnalysis(currencyCode = null, userId = null, timeframe = '30d', riskMetrics = ['var', 'volatility'], groupBy = 'currency') {
    const query = new GetCurrencyExposureAnalysisQuery({
      currencyCode,
      userId,
      timeframe,
      riskMetrics,
      groupBy
    });

    return await this.queryBus.execute(query);
  }

  // Utility methods
  async initializeDatabaseSchema() {
    try {
      this.logger.info('Initializing database schema...');

      await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        // Create currencies table
        await connection.execute(`
          CREATE TABLE IF NOT EXISTS currencies (
            id VARCHAR(36) PRIMARY KEY,
            currency_code VARCHAR(3) NOT NULL UNIQUE,
            currency_name VARCHAR(100) NOT NULL,
            symbol VARCHAR(10),
            decimal_places INT DEFAULT 2,
            is_active BOOLEAN DEFAULT TRUE,
            added_by VARCHAR(100),
            metadata JSON,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_currency_code (currency_code),
            INDEX idx_is_active (is_active)
          )
        `);

        // Create exchange_rates table
        await connection.execute(`
          CREATE TABLE IF NOT EXISTS exchange_rates (
            id VARCHAR(36) PRIMARY KEY,
            base_currency VARCHAR(3) NOT NULL,
            rates JSON NOT NULL,
            source VARCHAR(50) DEFAULT 'manual',
            update_type ENUM('full', 'partial') DEFAULT 'full',
            updated_by VARCHAR(100),
            metadata JSON,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_base_currency (base_currency),
            INDEX idx_timestamp (timestamp),
            INDEX idx_source (source)
          )
        `);

        // Create currency_conversions table
        await connection.execute(`
          CREATE TABLE IF NOT EXISTS currency_conversions (
            id VARCHAR(36) PRIMARY KEY,
            from_currency VARCHAR(3) NOT NULL,
            to_currency VARCHAR(3) NOT NULL,
            amount DECIMAL(20,8) NOT NULL,
            converted_amount DECIMAL(20,8) NOT NULL,
            exchange_rate DECIMAL(20,8) NOT NULL,
            fee DECIMAL(20,8) DEFAULT 0,
            user_id VARCHAR(100),
            purpose VARCHAR(100),
            metadata JSON,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_from_currency (from_currency),
            INDEX idx_to_currency (to_currency),
            INDEX idx_user_id (user_id),
            INDEX idx_timestamp (timestamp)
          )
        `);

        // Create currency_settings table
        await connection.execute(`
          CREATE TABLE IF NOT EXISTS currency_settings (
            id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
            setting_key VARCHAR(100) NOT NULL UNIQUE,
            setting_value VARCHAR(255) NOT NULL,
            updated_by VARCHAR(100),
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_setting_key (setting_key)
          )
        `);

        // Insert default base currency if not exists
        await connection.execute(`
          INSERT IGNORE INTO currency_settings (setting_key, setting_value, updated_by)
          VALUES ('base_currency', 'USD', 'system')
        `);

        // Insert some default currencies if not exists
        const defaultCurrencies = [
          { code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2 },
          { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2 },
          { code: 'GBP', name: 'British Pound', symbol: '£', decimals: 2 },
          { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimals: 0 },
          { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', decimals: 2 },
          { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', decimals: 2 }
        ];

        for (const currency of defaultCurrencies) {
          await connection.execute(`
            INSERT IGNORE INTO currencies (id, currency_code, currency_name, symbol, decimal_places, added_by)
            VALUES (UUID(), ?, ?, ?, ?, 'system')
          `, [currency.code, currency.name, currency.symbol, currency.decimals]);
        }
      });

      this.logger.info('Database schema initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize database schema:', error);
      throw error;
    }
  }

  // Event subscription methods
  async subscribeToEvents() {
    // Subscribe to relevant events from other services
    await this.kafkaService.subscribe('payment-events', this.handlePaymentEvent.bind(this));
    await this.kafkaService.subscribe('transaction-events', this.handleTransactionEvent.bind(this));
  }

  async handlePaymentEvent(event) {
    // Handle payment events that might affect currency conversions
    this.logger.info('Received payment event:', event.type);
  }

  async handleTransactionEvent(event) {
    // Handle transaction events for currency analytics
    this.logger.info('Received transaction event:', event.type);
  }

  // Health check
  async healthCheck() {
    return await this.getServiceHealth();
  }

  // Get service status
  getStatus() {
    return {
      service: 'currency-service',
      initialized: this.isInitialized,
      timestamp: new Date().toISOString()
    };
  }
}