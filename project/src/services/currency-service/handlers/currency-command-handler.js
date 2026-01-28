import { v4 as uuidv4 } from 'uuid';

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
  ExchangeRatesUpdatedEvent,
  CurrencyConvertedEvent,
  CurrencyAddedEvent,
  CurrencyRemovedEvent,
  CurrencySettingsUpdatedEvent,
  ExchangeRatesRefreshFailedEvent,
  BaseCurrencyChangedEvent,
  CurrencyServiceHealthCheckEvent,
  ExchangeRateSourceChangedEvent,
  BulkCurrencyUpdateEvent,
  BulkExchangeRatesUpdatedEvent,
  BulkCurrencyConversionCompletedEvent,
  CurrencyDataArchivedEvent,
  CurrencyDataPurgedEvent,
  SuspiciousCurrencyActivityFlaggedEvent,
  CurrencyReportGeneratedEvent,
  CurrencyRetentionPolicyUpdatedEvent,
  CurrencyAlertCreatedEvent,
  CurrencyRiskProfileUpdatedEvent,
  CurrencyComplianceCheckEvent,
  CurrencyFraudAlertEvent
} from '../events/currency-events.js';

export class CurrencyCommandHandler {
  constructor(dependencies) {
    this.connectionPool = dependencies.connectionPool;
    this.dualWriter = dependencies.dualWriter;
    this.eventStore = dependencies.eventStore;
    this.kafkaService = dependencies.kafkaService;
    this.logger = dependencies.logger;
    this.cache = new Map();
    this.externalApiService = dependencies.externalApiService;
  }

  async handle(command) {
    try {
      command.validate();

      switch (command.constructor.name) {
        case 'UpdateExchangeRatesCommand':
          return await this.handleUpdateExchangeRates(command);
        case 'ConvertCurrencyCommand':
          return await this.handleConvertCurrency(command);
        case 'AddCurrencyCommand':
          return await this.handleAddCurrency(command);
        case 'RemoveCurrencyCommand':
          return await this.handleRemoveCurrency(command);
        case 'UpdateCurrencySettingsCommand':
          return await this.handleUpdateCurrencySettings(command);
        case 'RefreshExchangeRatesCommand':
          return await this.handleRefreshExchangeRates(command);
        case 'SetBaseCurrencyCommand':
          return await this.handleSetBaseCurrency(command);
        case 'BulkUpdateExchangeRatesCommand':
          return await this.handleBulkUpdateExchangeRates(command);
        case 'BulkConvertCurrenciesCommand':
          return await this.handleBulkConvertCurrencies(command);
        case 'ArchiveCurrencyDataCommand':
          return await this.handleArchiveCurrencyData(command);
        case 'PurgeCurrencyDataCommand':
          return await this.handlePurgeCurrencyData(command);
        case 'FlagSuspiciousCurrencyActivityCommand':
          return await this.handleFlagSuspiciousCurrencyActivity(command);
        case 'GenerateCurrencyReportCommand':
          return await this.handleGenerateCurrencyReport(command);
        case 'UpdateCurrencyRetentionPolicyCommand':
          return await this.handleUpdateCurrencyRetentionPolicy(command);
        case 'CreateCurrencyAlertCommand':
          return await this.handleCreateCurrencyAlert(command);
        case 'UpdateCurrencyRiskProfileCommand':
          return await this.handleUpdateCurrencyRiskProfile(command);
        default:
          throw new Error(`Unknown command: ${command.constructor.name}`);
      }
    } catch (error) {
      this.logger.error(`Error handling command ${command.constructor.name}:`, error);
      throw error;
    }
  }

  async handleUpdateExchangeRates(command) {
    // Get current rates for comparison
    const currentRates = await this.getCurrentExchangeRates(command.baseCurrency);

    // Update rates in database
    const rateData = {
      id: command.id,
      base_currency: command.baseCurrency,
      rates: JSON.stringify(command.rates),
      source: command.source,
      update_type: command.updateType,
      updated_by: command.requestedBy,
      metadata: JSON.stringify(command.metadata),
      timestamp: command.timestamp
    };

    await this.dualWriter.write('exchange_rates', rateData);

    // Calculate changes
    const changes = this.calculateRateChanges(currentRates, command.rates);

    // Publish event
    const event = new ExchangeRatesUpdatedEvent({
      baseCurrency: command.baseCurrency,
      rates: command.rates,
      source: command.source,
      updateType: command.updateType,
      previousRates: currentRates,
      changes,
      metadata: command.metadata
    });

    await this.eventStore.saveEvent(event);
    await this.kafkaService.publishMessage('currency-events', event);

    // Update cache
    this.updateCache(command.baseCurrency, command.rates);

    this.logger.info(`Exchange rates updated: ${command.baseCurrency} with ${Object.keys(command.rates).length} rates`);

    return {
      baseCurrency: command.baseCurrency,
      rateCount: Object.keys(command.rates).length,
      changes: Object.keys(changes).length
    };
  }

  async handleConvertCurrency(command) {
    // Get current exchange rate
    const exchangeRate = await this.getExchangeRate(command.fromCurrency, command.toCurrency);

    if (!exchangeRate) {
      throw new Error(`Exchange rate not available for ${command.fromCurrency} to ${command.toCurrency}`);
    }

    // Calculate converted amount
    const convertedAmount = command.amount * exchangeRate;

    // Apply fee if applicable
    const fee = this.calculateConversionFee(command.amount, command.fromCurrency, command.toCurrency);
    const finalAmount = convertedAmount - fee;

    // Record conversion
    const conversionData = {
      id: command.id,
      from_currency: command.fromCurrency,
      to_currency: command.toCurrency,
      amount: command.amount,
      converted_amount: finalAmount,
      exchange_rate: exchangeRate,
      fee: fee,
      user_id: command.userId,
      purpose: command.purpose,
      metadata: JSON.stringify(command.metadata),
      timestamp: command.timestamp
    };

    await this.dualWriter.write('currency_conversions', conversionData);

    // Publish event
    const event = new CurrencyConvertedEvent({
      fromCurrency: command.fromCurrency,
      toCurrency: command.toCurrency,
      amount: command.amount,
      convertedAmount: finalAmount,
      exchangeRate,
      userId: command.userId,
      purpose: command.purpose,
      fee,
      metadata: command.metadata
    });

    await this.eventStore.saveEvent(event);
    await this.kafkaService.publishMessage('currency-events', event);

    this.logger.info(`Currency converted: ${command.amount} ${command.fromCurrency} to ${finalAmount} ${command.toCurrency}`);

    return {
      fromCurrency: command.fromCurrency,
      toCurrency: command.toCurrency,
      amount: command.amount,
      convertedAmount: finalAmount,
      exchangeRate,
      fee
    };
  }

  async handleAddCurrency(command) {
    // Check if currency already exists
    const existing = await this.getCurrencyByCode(command.currencyCode);
    if (existing) {
      throw new Error(`Currency ${command.currencyCode} already exists`);
    }

    // Add currency to database
    const currencyData = {
      id: command.id,
      currency_code: command.currencyCode,
      currency_name: command.currencyName,
      symbol: command.symbol,
      decimal_places: command.decimalPlaces,
      is_active: command.isActive,
      added_by: command.addedBy,
      metadata: JSON.stringify(command.metadata),
      created_at: command.timestamp,
      updated_at: command.timestamp
    };

    await this.dualWriter.write('currencies', currencyData);

    // Publish event
    const event = new CurrencyAddedEvent({
      currencyCode: command.currencyCode,
      currencyName: command.currencyName,
      symbol: command.symbol,
      decimalPlaces: command.decimalPlaces,
      isActive: command.isActive,
      addedBy: command.addedBy,
      metadata: command.metadata
    });

    await this.eventStore.saveEvent(event);
    await this.kafkaService.publishMessage('currency-events', event);

    this.logger.info(`Currency added: ${command.currencyCode} - ${command.currencyName}`);

    return {
      currencyCode: command.currencyCode,
      currencyName: command.currencyName
    };
  }

  async handleRemoveCurrency(command) {
    // Check if currency exists
    const existing = await this.getCurrencyByCode(command.currencyCode);
    if (!existing) {
      throw new Error(`Currency ${command.currencyCode} does not exist`);
    }

    // Check if currency is being used in active conversions
    const usageCount = await this.getCurrencyUsageCount(command.currencyCode);
    if (usageCount > 0) {
      throw new Error(`Cannot remove currency ${command.currencyCode} - it is being used in ${usageCount} active conversions`);
    }

    // Mark currency as inactive (soft delete)
    await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      await connection.execute(
        'UPDATE currencies SET is_active = 0, removed_by = ?, removal_reason = ?, updated_at = ? WHERE currency_code = ?',
        [command.removedBy, command.reason, command.timestamp, command.currencyCode]
      );
    });

    // Publish event
    const event = new CurrencyRemovedEvent({
      currencyCode: command.currencyCode,
      currencyName: existing.currency_name,
      removedBy: command.removedBy,
      reason: command.reason,
      metadata: command.metadata
    });

    await this.eventStore.saveEvent(event);
    await this.kafkaService.publishMessage('currency-events', event);

    this.logger.info(`Currency removed: ${command.currencyCode}`);

    return { currencyCode: command.currencyCode };
  }

  async handleUpdateCurrencySettings(command) {
    // Get current settings
    const currentSettings = await this.getCurrencyByCode(command.currencyCode);
    if (!currentSettings) {
      throw new Error(`Currency ${command.currencyCode} does not exist`);
    }

    // Update settings
    const updateFields = [];
    const updateValues = [];

    for (const [field, value] of Object.entries(command.updates)) {
      updateFields.push(`${field} = ?`);
      updateValues.push(value);
    }

    updateValues.push(command.timestamp, command.currencyCode);

    await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      await connection.execute(
        `UPDATE currencies SET ${updateFields.join(', ')}, updated_at = ? WHERE currency_code = ?`,
        updateValues
      );
    });

    // Publish event
    const event = new CurrencySettingsUpdatedEvent({
      currencyCode: command.currencyCode,
      updates: command.updates,
      previousSettings: currentSettings,
      updatedBy: command.updatedBy,
      metadata: command.metadata
    });

    await this.eventStore.saveEvent(event);
    await this.kafkaService.publishMessage('currency-events', event);

    this.logger.info(`Currency settings updated: ${command.currencyCode}`);

    return {
      currencyCode: command.currencyCode,
      updates: command.updates
    };
  }

  async handleRefreshExchangeRates(command) {
    try {
      // Fetch rates from external API
      const rates = await this.externalApiService.fetchExchangeRates();

      if (!rates || Object.keys(rates).length === 0) {
        throw new Error('Failed to fetch exchange rates from external API');
      }

      // Update rates using the update command
      const updateCommand = new UpdateExchangeRatesCommand({
        baseCurrency: 'USD', // Assuming USD as base
        rates,
        source: command.source,
        updateType: 'full',
        requestedBy: command.requestedBy,
        metadata: { ...command.metadata, refreshId: command.id }
      });

      return await this.handleUpdateExchangeRates(updateCommand);

    } catch (error) {
      // Publish failure event
      const failureEvent = new ExchangeRatesRefreshFailedEvent({
        source: command.source,
        error: error.message,
        lastSuccessfulUpdate: await this.getLastSuccessfulUpdate(),
        metadata: command.metadata
      });

      await this.eventStore.saveEvent(failureEvent);
      await this.kafkaService.publishMessage('currency-events', failureEvent);

      this.logger.error(`Exchange rates refresh failed: ${error.message}`);
      throw error;
    }
  }

  async handleSetBaseCurrency(command) {
    // Get current base currency
    const currentBase = await this.getBaseCurrency();

    // Update base currency setting
    await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      await connection.execute(
        'UPDATE currency_settings SET setting_value = ?, updated_by = ?, updated_at = ? WHERE setting_key = ?',
        [command.currencyCode, command.setBy, command.timestamp, 'base_currency']
      );
    });

    // Publish event
    const event = new BaseCurrencyChangedEvent({
      newBaseCurrency: command.currencyCode,
      previousBaseCurrency: currentBase,
      setBy: command.setBy,
      reason: command.reason,
      metadata: command.metadata
    });

    await this.eventStore.saveEvent(event);
    await this.kafkaService.publishMessage('currency-events', event);

    // Clear cache as base currency changed
    this.cache.clear();

    this.logger.info(`Base currency changed: ${currentBase} -> ${command.currencyCode}`);

    return {
      previousBaseCurrency: currentBase,
      newBaseCurrency: command.currencyCode
    };
  }

  async handleBulkUpdateExchangeRates(command) {
    const results = [];
    let successfulUpdates = 0;
    let failedUpdates = 0;

    for (const update of command.updates) {
      try {
        const updateCommand = new UpdateExchangeRatesCommand({
          baseCurrency: update.baseCurrency,
          rates: update.rates,
          source: command.source,
          updateType: 'full',
          requestedBy: command.requestedBy,
          metadata: { ...command.metadata, batchId: command.batchId }
        });

        const result = await this.handleUpdateExchangeRates(updateCommand);
        results.push({ baseCurrency: update.baseCurrency, success: true, result });
        successfulUpdates++;
      } catch (error) {
        this.logger.error(`Failed to update rates for ${update.baseCurrency}:`, error);
        results.push({ baseCurrency: update.baseCurrency, success: false, error: error.message });
        failedUpdates++;
      }
    }

    // Publish bulk update event
    const event = new BulkExchangeRatesUpdatedEvent({
      batchId: command.batchId,
      updates: command.updates,
      totalUpdates: command.updates.length,
      successfulUpdates,
      failedUpdates,
      source: command.source,
      requestedBy: command.requestedBy,
      metadata: command.metadata
    });

    await this.eventStore.saveEvent(event);
    await this.kafkaService.publishMessage('currency-events', event);

    this.logger.info(`Bulk exchange rates update completed: ${successfulUpdates}/${command.updates.length} successful`);

    return {
      batchId: command.batchId,
      totalUpdates: command.updates.length,
      successfulUpdates,
      failedUpdates,
      results
    };
  }

  async handleBulkConvertCurrencies(command) {
    const conversions = [];
    let successfulConversions = 0;
    let failedConversions = 0;
    let totalAmount = 0;

    for (const conversion of command.conversions) {
      try {
        const convertCommand = new ConvertCurrencyCommand({
          fromCurrency: conversion.fromCurrency,
          toCurrency: conversion.toCurrency,
          amount: conversion.amount,
          userId: command.userId,
          purpose: command.purpose,
          metadata: { ...command.metadata, batchId: command.batchId }
        });

        const result = await this.handleConvertCurrency(convertCommand);
        conversions.push({ ...conversion, success: true, result });
        successfulConversions++;
        totalAmount += conversion.amount;
      } catch (error) {
        this.logger.error(`Failed to convert ${conversion.amount} ${conversion.fromCurrency} to ${conversion.toCurrency}:`, error);
        conversions.push({ ...conversion, success: false, error: error.message });
        failedConversions++;
      }
    }

    // Publish bulk conversion event
    const event = new BulkCurrencyConversionCompletedEvent({
      batchId: command.batchId,
      conversions,
      totalConversions: command.conversions.length,
      successfulConversions,
      failedConversions,
      totalAmount,
      userId: command.userId,
      purpose: command.purpose,
      metadata: command.metadata
    });

    await this.eventStore.saveEvent(event);
    await this.kafkaService.publishMessage('currency-events', event);

    this.logger.info(`Bulk currency conversion completed: ${successfulConversions}/${command.conversions.length} successful`);

    return {
      batchId: command.batchId,
      totalConversions: command.conversions.length,
      successfulConversions,
      failedConversions,
      totalAmount,
      conversions
    };
  }

  async handleArchiveCurrencyData(command) {
    // Create archive record
    const archiveData = {
      id: command.id,
      criteria: JSON.stringify(command.criteria),
      archive_to: command.archiveTo,
      retention_period_days: command.retentionPeriod,
      compression: command.compression,
      encryption: command.encryption,
      requested_by: command.requestedBy,
      reason: command.reason,
      status: 'in_progress',
      metadata: JSON.stringify(command.metadata),
      created_at: command.timestamp
    };

    await this.dualWriter.write('currency_data_archives', archiveData);

    // Perform archiving based on criteria
    const archivedRecords = await this.performDataArchiving(command.criteria, command.archiveTo);

    // Update archive record with results
    await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      await connection.execute(
        'UPDATE currency_data_archives SET records_archived = ?, archive_size_bytes = ?, status = ?, completed_at = ? WHERE id = ?',
        [archivedRecords.count, archivedRecords.size, 'completed', new Date().toISOString(), command.id]
      );
    });

    // Publish event
    const event = new CurrencyDataArchivedEvent({
      criteria: command.criteria,
      archiveTo: command.archiveTo,
      retentionPeriod: command.retentionPeriod,
      recordsArchived: archivedRecords.count,
      archiveSize: archivedRecords.size,
      compression: command.compression,
      encryption: command.encryption,
      requestedBy: command.requestedBy,
      reason: command.reason,
      metadata: command.metadata
    });

    await this.eventStore.saveEvent(event);
    await this.kafkaService.publishMessage('currency-events', event);

    this.logger.info(`Currency data archived: ${archivedRecords.count} records to ${command.archiveTo}`);

    return {
      archiveId: command.id,
      recordsArchived: archivedRecords.count,
      archiveSize: archivedRecords.size,
      archiveLocation: command.archiveTo
    };
  }

  async handlePurgeCurrencyData(command) {
    // Verify compliance approval if required
    if (command.complianceApproval) {
      await this.verifyComplianceApproval(command.complianceApproval);
    }

    // Create backup if requested
    let backupCreated = false;
    if (command.backupFirst) {
      backupCreated = await this.createDataBackup(command.criteria, command.olderThan);
    }

    // Perform purging
    const purgedRecords = await this.performDataPurging(command.criteria, command.olderThan);

    // Record purge operation
    const purgeData = {
      id: command.id,
      criteria: JSON.stringify(command.criteria),
      older_than: command.olderThan,
      records_purged: purgedRecords.count,
      data_size_purged: purgedRecords.size,
      force_delete: command.forceDelete,
      backup_created: backupCreated,
      approved_by: command.approvedBy,
      compliance_approval: JSON.stringify(command.complianceApproval),
      metadata: JSON.stringify(command.metadata),
      created_at: command.timestamp
    };

    await this.dualWriter.write('currency_data_purges', purgeData);

    // Publish event
    const event = new CurrencyDataPurgedEvent({
      criteria: command.criteria,
      olderThan: command.olderThan,
      recordsPurged: purgedRecords.count,
      dataSizePurged: purgedRecords.size,
      forceDelete: command.forceDelete,
      backupCreated,
      approvedBy: command.approvedBy,
      complianceApproval: command.complianceApproval,
      metadata: command.metadata
    });

    await this.eventStore.saveEvent(event);
    await this.kafkaService.publishMessage('currency-events', event);

    this.logger.info(`Currency data purged: ${purgedRecords.count} records older than ${command.olderThan}`);

    return {
      purgeId: command.id,
      recordsPurged: purgedRecords.count,
      dataSizePurged: purgedRecords.size,
      backupCreated
    };
  }

  async handleFlagSuspiciousCurrencyActivity(command) {
    // Calculate risk score if not provided
    let riskScore = command.riskScore;
    if (riskScore === undefined) {
      riskScore = await this.calculateSuspiciousActivityRiskScore(command);
    }

    // Determine automatic actions
    const automaticAction = await this.determineAutomaticAction(command.activityType, riskScore, command.severity);

    // Record suspicious activity
    const activityData = {
      id: command.id,
      conversion_id: command.conversionId,
      user_id: command.userId,
      activity_type: command.activityType,
      severity: command.severity,
      indicators: JSON.stringify(command.indicators),
      risk_score: riskScore,
      automatic_action: JSON.stringify(automaticAction),
      requires_review: command.requiresReview,
      escalation_level: command.escalationLevel,
      status: 'flagged',
      reviewed_by: null,
      review_notes: null,
      metadata: JSON.stringify(command.metadata),
      created_at: command.timestamp
    };

    await this.dualWriter.write('suspicious_currency_activities', activityData);

    // Execute automatic actions if any
    if (automaticAction && automaticAction.length > 0) {
      await this.executeAutomaticActions(automaticAction, command);
    }

    // Publish event
    const event = new SuspiciousCurrencyActivityFlaggedEvent({
      conversionId: command.conversionId,
      userId: command.userId,
      activityType: command.activityType,
      severity: command.severity,
      indicators: command.indicators,
      riskScore,
      automaticAction,
      requiresReview: command.requiresReview,
      escalationLevel: command.escalationLevel,
      metadata: command.metadata
    });

    await this.eventStore.saveEvent(event);
    await this.kafkaService.publishMessage('currency-events', event);

    this.logger.warn(`Suspicious currency activity flagged: ${command.activityType} (severity: ${command.severity}, risk: ${riskScore})`);

    return {
      activityId: command.id,
      activityType: command.activityType,
      severity: command.severity,
      riskScore,
      automaticAction,
      requiresReview: command.requiresReview
    };
  }

  async handleGenerateCurrencyReport(command) {
    // Generate report based on type
    const reportData = await this.generateReportData(command.reportType, command.parameters, command.filters, command.timeRange);

    // Apply compliance filtering if required
    if (command.includeCompliance) {
      reportData.complianceData = await this.generateComplianceData(reportData);
    }

    // Apply risk analysis if required
    if (command.includeRiskAnalysis) {
      reportData.riskAnalysis = await this.performRiskAnalysis(reportData);
    }

    // Format report
    const formattedReport = await this.formatReport(reportData, command.format);

    // Save report
    const reportRecord = {
      id: command.id,
      report_id: uuidv4(),
      report_type: command.reportType,
      parameters: JSON.stringify(command.parameters),
      filters: JSON.stringify(command.filters),
      format: command.format,
      record_count: reportData.recordCount || 0,
      file_size_bytes: formattedReport.size || 0,
      generation_time_ms: formattedReport.generationTime || 0,
      include_compliance: command.includeCompliance,
      include_risk_analysis: command.includeRiskAnalysis,
      generated_by: command.generatedBy,
      status: 'completed',
      file_path: formattedReport.filePath,
      metadata: JSON.stringify(command.metadata),
      created_at: command.timestamp
    };

    await this.dualWriter.write('currency_reports', reportRecord);

    // Publish event
    const event = new CurrencyReportGeneratedEvent({
      reportId: reportRecord.report_id,
      reportType: command.reportType,
      parameters: command.parameters,
      filters: command.filters,
      format: command.format,
      recordCount: reportData.recordCount,
      fileSize: formattedReport.size,
      generationTime: formattedReport.generationTime,
      includeCompliance: command.includeCompliance,
      includeRiskAnalysis: command.includeRiskAnalysis,
      generatedBy: command.generatedBy,
      metadata: command.metadata
    });

    await this.eventStore.saveEvent(event);
    await this.kafkaService.publishMessage('currency-events', event);

    this.logger.info(`Currency report generated: ${command.reportType} (${formattedReport.size} bytes)`);

    return {
      reportId: reportRecord.report_id,
      reportType: command.reportType,
      recordCount: reportData.recordCount,
      fileSize: formattedReport.size,
      filePath: formattedReport.filePath
    };
  }

  async handleUpdateCurrencyRetentionPolicy(command) {
    // Save retention policy
    const policyData = {
      id: command.id,
      policy_id: command.policyId,
      name: command.name,
      description: command.description,
      retention_rules: JSON.stringify(command.retentionRules),
      compliance_requirements: JSON.stringify(command.complianceRequirements),
      auto_archive: command.autoArchive,
      auto_purge: command.autoPurge,
      notification_settings: JSON.stringify(command.notificationSettings),
      approved_by: command.approvedBy,
      effective_date: command.effectiveDate,
      status: 'active',
      metadata: JSON.stringify(command.metadata),
      created_at: command.timestamp,
      updated_at: command.timestamp
    };

    await this.dualWriter.write('currency_retention_policies', policyData);

    // Update existing policies to inactive if this is the new active policy
    await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      await connection.execute(
        'UPDATE currency_retention_policies SET status = ? WHERE policy_id != ? AND status = ?',
        ['inactive', command.policyId, 'active']
      );
    });

    // Publish event
    const event = new CurrencyRetentionPolicyUpdatedEvent({
      policyId: command.policyId,
      name: command.name,
      description: command.description,
      retentionRules: command.retentionRules,
      complianceRequirements: command.complianceRequirements,
      autoArchive: command.autoArchive,
      autoPurge: command.autoPurge,
      notificationSettings: command.notificationSettings,
      approvedBy: command.approvedBy,
      effectiveDate: command.effectiveDate,
      metadata: command.metadata
    });

    await this.eventStore.saveEvent(event);
    await this.kafkaService.publishMessage('currency-events', event);

    this.logger.info(`Currency retention policy updated: ${command.name} (${command.policyId})`);

    return {
      policyId: command.policyId,
      name: command.name,
      effectiveDate: command.effectiveDate
    };
  }

  async handleCreateCurrencyAlert(command) {
    // Validate currency pair exists
    const validPair = await this.validateCurrencyPair(command.currencyPair);
    if (!validPair) {
      throw new Error(`Invalid currency pair: ${command.currencyPair}`);
    }

    // Create alert
    const alertData = {
      id: command.id,
      alert_id: uuidv4(),
      alert_type: command.alertType,
      currency_pair: command.currencyPair,
      condition: command.condition,
      threshold: command.threshold,
      user_id: command.userId,
      notification_channels: JSON.stringify(command.notificationChannels),
      is_active: command.isActive,
      triggered_count: 0,
      last_triggered: null,
      metadata: JSON.stringify(command.metadata),
      created_at: command.timestamp
    };

    await this.dualWriter.write('currency_alerts', alertData);

    // Publish event
    const event = new CurrencyAlertCreatedEvent({
      alertId: alertData.alert_id,
      alertType: command.alertType,
      currencyPair: command.currencyPair,
      condition: command.condition,
      threshold: command.threshold,
      userId: command.userId,
      notificationChannels: command.notificationChannels,
      isActive: command.isActive,
      metadata: command.metadata
    });

    await this.eventStore.saveEvent(event);
    await this.kafkaService.publishMessage('currency-events', event);

    this.logger.info(`Currency alert created: ${command.alertType} for ${command.currencyPair}`);

    return {
      alertId: alertData.alert_id,
      alertType: command.alertType,
      currencyPair: command.currencyPair,
      threshold: command.threshold
    };
  }

  async handleUpdateCurrencyRiskProfile(command) {
    // Get current risk profile
    const currentProfile = await this.getCurrencyRiskProfile(command.currencyCode);

    // Update risk profile
    const profileData = {
      id: command.id,
      currency_code: command.currencyCode,
      risk_level: command.riskLevel,
      volatility_index: command.volatilityIndex,
      liquidity_score: command.liquidityScore,
      regulatory_flags: JSON.stringify(command.regulatoryFlags),
      sanctions_status: command.sanctionsStatus,
      updated_by: command.updatedBy,
      metadata: JSON.stringify(command.metadata),
      updated_at: command.timestamp
    };

    await this.dualWriter.write('currency_risk_profiles', profileData);

    // Publish event
    const event = new CurrencyRiskProfileUpdatedEvent({
      currencyCode: command.currencyCode,
      riskLevel: command.riskLevel,
      previousRiskLevel: currentProfile?.risk_level,
      volatilityIndex: command.volatilityIndex,
      liquidityScore: command.liquidityScore,
      regulatoryFlags: command.regulatoryFlags,
      sanctionsStatus: command.sanctionsStatus,
      updatedBy: command.updatedBy,
      metadata: command.metadata
    });

    await this.eventStore.saveEvent(event);
    await this.kafkaService.publishMessage('currency-events', event);

    this.logger.info(`Currency risk profile updated: ${command.currencyCode} (${command.riskLevel})`);

    return {
      currencyCode: command.currencyCode,
      riskLevel: command.riskLevel,
      volatilityIndex: command.volatilityIndex,
      liquidityScore: command.liquidityScore
    };
  }

  // Helper methods
  async getCurrentExchangeRates(baseCurrency) {
    return await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT rates FROM exchange_rates WHERE base_currency = ? ORDER BY timestamp DESC LIMIT 1',
        [baseCurrency]
      );

      if (rows.length > 0) {
        return JSON.parse(rows[0].rates);
      }
      return {};
    });
  }

  async getExchangeRate(fromCurrency, toCurrency) {
    const baseRates = await this.getCurrentExchangeRates('USD');

    if (fromCurrency === 'USD') {
      return baseRates[toCurrency] || null;
    } else if (toCurrency === 'USD') {
      return 1 / (baseRates[fromCurrency] || 0);
    } else {
      const fromRate = baseRates[fromCurrency];
      const toRate = baseRates[toCurrency];
      return toRate && fromRate ? toRate / fromRate : null;
    }
  }

  calculateConversionFee(amount, fromCurrency, toCurrency) {
    // Simple fee calculation - can be made more sophisticated
    const feePercentage = 0.001; // 0.1%
    return amount * feePercentage;
  }

  async getCurrencyByCode(currencyCode) {
    return await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT * FROM currencies WHERE currency_code = ? AND is_active = 1',
        [currencyCode]
      );
      return rows.length > 0 ? rows[0] : null;
    });
  }

  async getCurrencyUsageCount(currencyCode) {
    return await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT COUNT(*) as count FROM currency_conversions WHERE (from_currency = ? OR to_currency = ?) AND timestamp > DATE_SUB(NOW(), INTERVAL 30 DAY)',
        [currencyCode, currencyCode]
      );
      return rows[0].count;
    });
  }

  calculateRateChanges(oldRates, newRates) {
    const changes = {};
    const allCurrencies = new Set([...Object.keys(oldRates), ...Object.keys(newRates)]);

    for (const currency of allCurrencies) {
      const oldRate = oldRates[currency] || 0;
      const newRate = newRates[currency] || 0;

      if (oldRate !== newRate) {
        const changePercent = oldRate > 0 ? ((newRate - oldRate) / oldRate) * 100 : 0;
        changes[currency] = {
          oldRate,
          newRate,
          changePercent: Math.round(changePercent * 10000) / 10000 // Round to 4 decimal places
        };
      }
    }

    return changes;
  }

  updateCache(baseCurrency, rates) {
    const cacheKey = `rates_${baseCurrency}`;
    this.cache.set(cacheKey, {
      rates,
      timestamp: Date.now()
    });
  }

  async getBaseCurrency() {
    return await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT setting_value FROM currency_settings WHERE setting_key = ?',
        ['base_currency']
      );
      return rows.length > 0 ? rows[0].setting_value : 'USD';
    });
  }

  async getLastSuccessfulUpdate() {
    return await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT timestamp FROM exchange_rates ORDER BY timestamp DESC LIMIT 1'
      );
      return rows.length > 0 ? rows[0].timestamp : null;
    });
  }

  async performDataArchiving(criteria, archiveTo) {
    // This is a simplified implementation - in reality, this would involve
    // complex archiving logic based on the criteria
    let count = 0;
    let size = 0;

    // Archive old exchange rates
    if (criteria.includeExchangeRates) {
      const archivedRates = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute(
          'SELECT COUNT(*) as count, SUM(LENGTH(rates)) as size FROM exchange_rates WHERE timestamp < ?',
          [criteria.olderThan || '2020-01-01']
        );
        return rows[0];
      });
      count += archivedRates.count;
      size += archivedRates.size || 0;
    }

    // Archive old conversions
    if (criteria.includeConversions) {
      const archivedConversions = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute(
          'SELECT COUNT(*) as count FROM currency_conversions WHERE timestamp < ?',
          [criteria.olderThan || '2020-01-01']
        );
        return rows[0];
      });
      count += archivedConversions.count;
    }

    return { count, size };
  }

  async performDataPurging(criteria, olderThan) {
    let count = 0;
    let size = 0;

    // Purge old exchange rates
    if (criteria.includeExchangeRates) {
      const purgedRates = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [result] = await connection.execute(
          'DELETE FROM exchange_rates WHERE timestamp < ?',
          [olderThan]
        );
        return result.affectedRows;
      });
      count += purgedRates;
    }

    // Purge old conversions
    if (criteria.includeConversions) {
      const purgedConversions = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [result] = await connection.execute(
          'DELETE FROM currency_conversions WHERE timestamp < ?',
          [olderThan]
        );
        return result.affectedRows;
      });
      count += purgedConversions;
    }

    return { count, size: count * 1024 }; // Rough estimate
  }

  async verifyComplianceApproval(approval) {
    // Verify compliance approval - simplified implementation
    if (!approval.approvedBy || !approval.approvalDate) {
      throw new Error('Invalid compliance approval');
    }
    return true;
  }

  async createDataBackup(criteria, olderThan) {
    // Create backup - simplified implementation
    this.logger.info('Creating data backup before purging');
    return true;
  }

  async calculateSuspiciousActivityRiskScore(command) {
    // Calculate risk score based on activity type and indicators
    let baseScore = 0;

    switch (command.activityType) {
      case 'unusual_conversion_amount':
        baseScore = 60;
        break;
      case 'rapid_conversions':
        baseScore = 70;
        break;
      case 'circular_trading':
        baseScore = 85;
        break;
      case 'blacklisted_currency':
        baseScore = 95;
        break;
      default:
        baseScore = 50;
    }

    // Adjust based on indicators
    if (command.indicators && command.indicators.length > 0) {
      baseScore += command.indicators.length * 5;
    }

    return Math.min(baseScore, 100);
  }

  async determineAutomaticAction(activityType, riskScore, severity) {
    const actions = [];

    if (riskScore >= 90 || severity === 'critical') {
      actions.push('block_user', 'notify_compliance', 'create_incident');
    } else if (riskScore >= 70 || severity === 'high') {
      actions.push('flag_for_review', 'notify_compliance');
    } else if (riskScore >= 50 || severity === 'medium') {
      actions.push('increase_monitoring', 'flag_for_review');
    }

    return actions;
  }

  async executeAutomaticActions(actions, command) {
    for (const action of actions) {
      switch (action) {
        case 'block_user':
          await this.blockUser(command.userId);
          break;
        case 'flag_for_review':
          await this.flagForReview(command.id);
          break;
        case 'increase_monitoring':
          await this.increaseMonitoring(command.userId);
          break;
        case 'notify_compliance':
          await this.notifyCompliance(command);
          break;
        case 'create_incident':
          await this.createIncident(command);
          break;
      }
    }
  }

  async generateReportData(reportType, parameters, filters, timeRange) {
    // Generate report data based on type - simplified implementation
    const data = {
      reportType,
      generatedAt: new Date().toISOString(),
      parameters,
      filters,
      timeRange,
      recordCount: 0
    };

    switch (reportType) {
      case 'conversion-summary':
        data.conversions = await this.getConversionSummary(timeRange, filters);
        data.recordCount = data.conversions.length;
        break;
      case 'exchange-rate-analysis':
        data.rates = await this.getExchangeRateAnalysis(timeRange, filters);
        data.recordCount = data.rates.length;
        break;
      case 'regulatory-compliance':
        data.compliance = await this.getComplianceReport(timeRange, filters);
        data.recordCount = data.compliance.length;
        break;
    }

    return data;
  }

  async generateComplianceData(reportData) {
    // Generate compliance-related data - simplified
    return {
      regulations: ['AML', 'KYC', 'FATF'],
      complianceStatus: 'compliant',
      lastAudit: new Date().toISOString()
    };
  }

  async performRiskAnalysis(reportData) {
    // Perform risk analysis - simplified
    return {
      overallRisk: 'low',
      riskFactors: ['market_volatility', 'geographic_exposure'],
      recommendations: ['diversify_currencies', 'monitor_high_risk_pairs']
    };
  }

  async formatReport(data, format) {
    // Format report - simplified implementation
    const startTime = Date.now();

    let content = '';
    switch (format) {
      case 'json':
        content = JSON.stringify(data, null, 2);
        break;
      case 'csv':
        content = this.convertToCSV(data);
        break;
      default:
        content = JSON.stringify(data);
    }

    return {
      content,
      size: Buffer.byteLength(content, 'utf8'),
      generationTime: Date.now() - startTime,
      filePath: `/reports/currency_${Date.now()}.${format}`
    };
  }

  async validateCurrencyPair(pair) {
    // Validate currency pair exists - simplified
    const currencies = pair.split('/');
    if (currencies.length !== 2) return false;

    const [base, quote] = currencies;
    const baseExists = await this.getCurrencyByCode(base);
    const quoteExists = await this.getCurrencyByCode(quote);

    return baseExists && quoteExists;
  }

  async getCurrencyRiskProfile(currencyCode) {
    return await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT * FROM currency_risk_profiles WHERE currency_code = ? ORDER BY updated_at DESC LIMIT 1',
        [currencyCode]
      );
      return rows.length > 0 ? rows[0] : null;
    });
  }

  // Additional helper methods for automatic actions
  async blockUser(userId) {
    this.logger.warn(`Blocking user ${userId} due to suspicious activity`);
    // Implementation would update user status
  }

  async flagForReview(activityId) {
    this.logger.info(`Flagging activity ${activityId} for review`);
    // Implementation would update activity status
  }

  async increaseMonitoring(userId) {
    this.logger.info(`Increasing monitoring for user ${userId}`);
    // Implementation would update monitoring settings
  }

  async notifyCompliance(command) {
    this.logger.info('Notifying compliance team');
    // Implementation would send notification
  }

  async createIncident(command) {
    this.logger.warn('Creating compliance incident');
    // Implementation would create incident record
  }

  // Report generation helpers
  async getConversionSummary(timeRange, filters) {
    // Simplified implementation
    return await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      let query = 'SELECT from_currency, to_currency, COUNT(*) as count, SUM(amount) as total FROM currency_conversions WHERE 1=1';
      const params = [];

      if (timeRange?.start) {
        query += ' AND timestamp >= ?';
        params.push(timeRange.start);
      }
      if (timeRange?.end) {
        query += ' AND timestamp <= ?';
        params.push(timeRange.end);
      }

      query += ' GROUP BY from_currency, to_currency';

      const [rows] = await connection.execute(query, params);
      return rows;
    });
  }

  async getExchangeRateAnalysis(timeRange, filters) {
    // Simplified implementation
    return await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      let query = 'SELECT base_currency, COUNT(*) as updates FROM exchange_rates WHERE 1=1';
      const params = [];

      if (timeRange?.start) {
        query += ' AND timestamp >= ?';
        params.push(timeRange.start);
      }
      if (timeRange?.end) {
        query += ' AND timestamp <= ?';
        params.push(timeRange.end);
      }

      query += ' GROUP BY base_currency';

      const [rows] = await connection.execute(query, params);
      return rows;
    });
  }

  async getComplianceReport(timeRange, filters) {
    // Simplified implementation
    return await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      let query = 'SELECT activity_type, severity, COUNT(*) as count FROM suspicious_currency_activities WHERE 1=1';
      const params = [];

      if (timeRange?.start) {
        query += ' AND created_at >= ?';
        params.push(timeRange.start);
      }
      if (timeRange?.end) {
        query += ' AND created_at <= ?';
        params.push(timeRange.end);
      }

      query += ' GROUP BY activity_type, severity';

      const [rows] = await connection.execute(query, params);
      return rows;
    });
  }

  convertToCSV(data) {
    // Simple CSV conversion - in reality, this would be more sophisticated
    if (Array.isArray(data)) {
      const headers = Object.keys(data[0] || {}).join(',');
      const rows = data.map(row => Object.values(row).join(','));
      return [headers, ...rows].join('\n');
    }
    return JSON.stringify(data);
  }
}