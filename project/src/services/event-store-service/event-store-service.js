import { CommandBus } from '../../../shared/cqrs/command-bus.js';
import { QueryBus } from '../../../shared/cqrs/query-bus.js';
import { EventStore } from '../../../shared/event-sourcing/event-store.js';
import { DualWriter } from '../../../shared/database/dual-writer.js';
import { KafkaService } from '../../../shared/messaging/kafka-service.js';
import { ConnectionPool } from '../../../shared/database/connection-pool.js';
import { Logger } from '../../../shared/logging/logger.js';

import { EventStoreCommandHandler } from './handlers/event-store-command-handler.js';
import { EventStoreQueryHandler } from './handlers/event-store-query-handler.js';

import {
  StoreEventCommand,
  StoreEventsBatchCommand,
  ReplayEventsCommand,
  CreateSnapshotCommand,
  CreateProjectionCommand,
  UpdateProjectionCommand,
  CreateSagaCommand,
  ProcessSagaEventCommand,
  ArchiveEventsCommand,
  ValidateEventCommand,
  TransformEventsCommand,
  CreateEventStoreAlertCommand,
  UpdateEventStoreSettingsCommand,
  CreateEventStoreBackupCommand,
  RestoreEventStoreCommand,
  PurgeEventStoreDataCommand,
  CreateEventStoreReportCommand
} from './commands/event-store-commands.js';

import {
  GetEventsForAggregateQuery,
  GetEventsQuery,
  GetSnapshotQuery,
  RebuildAggregateStateQuery,
  SearchEventsQuery,
  GetProjectionQuery,
  GetSagaQuery,
  GetEventStatisticsQuery,
  GetCorrelatedEventsQuery,
  GetEventStoreHealthQuery,
  GetEventStoreMetricsQuery,
  GetEventStoreAlertsQuery,
  GetEventStoreBackupsQuery,
  GetEventStoreReportsQuery,
  GetEventStoreSettingsQuery,
  GetEventStoreAuditLogQuery,
  GetEventStorePerformanceMetricsQuery,
  GetEventStoreStorageMetricsQuery
} from './queries/event-store-queries.js';

export class EventStoreService {
  constructor(dependencies = {}) {
    this.connectionPool = dependencies.connectionPool || new ConnectionPool();
    this.kafkaService = dependencies.kafkaService || new KafkaService();
    this.logger = dependencies.logger || new Logger();
    this.eventStore = new Map(); // In-memory store for replay capabilities

    // Initialize CQRS components
    this.commandBus = new CommandBus();
    this.queryBus = new QueryBus();

    // Initialize handlers
    this.commandHandler = new EventStoreCommandHandler({
      connectionPool: this.connectionPool,
      dualWriter: dependencies.dualWriter || new DualWriter(this.connectionPool),
      kafkaService: this.kafkaService,
      logger: this.logger,
      eventStore: this.eventStore
    });

    this.queryHandler = new EventStoreQueryHandler({
      connectionPool: this.connectionPool,
      dualWriter: dependencies.dualWriter || new DualWriter(this.connectionPool),
      logger: this.logger,
      eventStore: this.eventStore
    });

    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;

    try {
      // Initialize dependencies
      await this.connectionPool.initialize();
      await this.kafkaService.initialize();

      // Register command handlers
      this.commandBus.registerHandler('StoreEventCommand', this.commandHandler);
      this.commandBus.registerHandler('StoreEventsBatchCommand', this.commandHandler);
      this.commandBus.registerHandler('ReplayEventsCommand', this.commandHandler);
      this.commandBus.registerHandler('CreateSnapshotCommand', this.commandHandler);
      this.commandBus.registerHandler('CreateProjectionCommand', this.commandHandler);
      this.commandBus.registerHandler('UpdateProjectionCommand', this.commandHandler);
      this.commandBus.registerHandler('CreateSagaCommand', this.commandHandler);
      this.commandBus.registerHandler('ProcessSagaEventCommand', this.commandHandler);
      this.commandBus.registerHandler('ArchiveEventsCommand', this.commandHandler);
      this.commandBus.registerHandler('ValidateEventCommand', this.commandHandler);
      this.commandBus.registerHandler('TransformEventsCommand', this.commandHandler);
      this.commandBus.registerHandler('CreateEventStoreAlertCommand', this.commandHandler);
      this.commandBus.registerHandler('UpdateEventStoreSettingsCommand', this.commandHandler);
      this.commandBus.registerHandler('CreateEventStoreBackupCommand', this.commandHandler);
      this.commandBus.registerHandler('RestoreEventStoreCommand', this.commandHandler);
      this.commandBus.registerHandler('PurgeEventStoreDataCommand', this.commandHandler);
      this.commandBus.registerHandler('CreateEventStoreReportCommand', this.commandHandler);

      // Register query handlers
      this.queryBus.registerHandler('GetEventsForAggregateQuery', this.queryHandler);
      this.queryBus.registerHandler('GetEventsQuery', this.queryHandler);
      this.queryBus.registerHandler('GetSnapshotQuery', this.queryHandler);
      this.queryBus.registerHandler('RebuildAggregateStateQuery', this.queryHandler);
      this.queryBus.registerHandler('SearchEventsQuery', this.queryHandler);
      this.queryBus.registerHandler('GetProjectionQuery', this.queryHandler);
      this.queryBus.registerHandler('GetSagaQuery', this.queryHandler);
      this.queryBus.registerHandler('GetEventStatisticsQuery', this.queryHandler);
      this.queryBus.registerHandler('GetCorrelatedEventsQuery', this.queryHandler);
      this.queryBus.registerHandler('GetEventStoreHealthQuery', this.queryHandler);
      this.queryBus.registerHandler('GetEventStoreMetricsQuery', this.queryHandler);
      this.queryBus.registerHandler('GetEventStoreAlertsQuery', this.queryHandler);
      this.queryBus.registerHandler('GetEventStoreBackupsQuery', this.queryHandler);
      this.queryBus.registerHandler('GetEventStoreReportsQuery', this.queryHandler);
      this.queryBus.registerHandler('GetEventStoreSettingsQuery', this.queryHandler);
      this.queryBus.registerHandler('GetEventStoreAuditLogQuery', this.queryHandler);
      this.queryBus.registerHandler('GetEventStorePerformanceMetricsQuery', this.queryHandler);
      this.queryBus.registerHandler('GetEventStoreStorageMetricsQuery', this.queryHandler);

      this.isInitialized = true;
      this.logger.info('EventStoreService initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize EventStoreService:', error);
      throw error;
    }
  }

  // Command methods
  async storeEvent(aggregateId, aggregateType, eventType, eventData, metadata = {}) {
    const command = new StoreEventCommand(aggregateId, aggregateType, eventType, eventData, metadata);
    return await this.commandBus.execute(command);
  }

  async storeEventsBatch(events) {
    const command = new StoreEventsBatchCommand(events);
    return await this.commandBus.execute(command);
  }

  async replayEvents(aggregateId, fromVersion, toVersion) {
    const command = new ReplayEventsCommand(aggregateId, fromVersion, toVersion);
    return await this.commandBus.execute(command);
  }

  async createSnapshot(aggregateId, state, version) {
    const command = new CreateSnapshotCommand(aggregateId, state, version);
    return await this.commandBus.execute(command);
  }

  async createProjection(name, aggregateType, eventTypes, initialState = {}) {
    const command = new CreateProjectionCommand(name, aggregateType, eventTypes, initialState);
    return await this.commandBus.execute(command);
  }

  async updateProjection(name, rebuild = false) {
    const command = new UpdateProjectionCommand(name, rebuild);
    return await this.commandBus.execute(command);
  }

  async createSaga(sagaType, initiatingEvent, steps) {
    const command = new CreateSagaCommand(sagaType, initiatingEvent, steps);
    return await this.commandBus.execute(command);
  }

  async processSagaEvent(sagaId, eventType, eventData) {
    const command = new ProcessSagaEventCommand(sagaId, eventType, eventData);
    return await this.commandBus.execute(command);
  }

  async archiveEvents(aggregateType, beforeDate, archivePath) {
    const command = new ArchiveEventsCommand(aggregateType, beforeDate, archivePath);
    return await this.commandBus.execute(command);
  }

  async validateEvent(event) {
    const command = new ValidateEventCommand(event);
    return await this.commandBus.execute(command);
  }

  async transformEvents(events, transformation) {
    const command = new TransformEventsCommand(events, transformation);
    return await this.commandBus.execute(command);
  }

  async createEventStoreAlert(alertType, message, severity, metadata = {}) {
    const command = new CreateEventStoreAlertCommand(alertType, message, severity, metadata);
    return await this.commandBus.execute(command);
  }

  async updateEventStoreSettings(settings) {
    const command = new UpdateEventStoreSettingsCommand(settings);
    return await this.commandBus.execute(command);
  }

  async createEventStoreBackup(backupType, options = {}) {
    const command = new CreateEventStoreBackupCommand(backupType, options);
    return await this.commandBus.execute(command);
  }

  async restoreEventStore(backupId, options = {}) {
    const command = new RestoreEventStoreCommand(backupId, options);
    return await this.commandBus.execute(command);
  }

  async purgeEventStoreData(criteria, reason) {
    const command = new PurgeEventStoreDataCommand(criteria, reason);
    return await this.commandBus.execute(command);
  }

  async createEventStoreReport(reportType, parameters = {}) {
    const command = new CreateEventStoreReportCommand(reportType, parameters);
    return await this.commandBus.execute(command);
  }

  // Query methods
  async getEventsForAggregate(aggregateId, fromVersion, toVersion, limit) {
    const query = new GetEventsForAggregateQuery(aggregateId, fromVersion, toVersion, limit);
    return await this.queryBus.execute(query);
  }

  async getEvents(filters) {
    const query = new GetEventsQuery(filters);
    return await this.queryBus.execute(query);
  }

  async getSnapshot(aggregateId) {
    const query = new GetSnapshotQuery(aggregateId);
    return await this.queryBus.execute(query);
  }

  async rebuildAggregateState(aggregateId) {
    const query = new RebuildAggregateStateQuery(aggregateId);
    return await this.queryBus.execute(query);
  }

  async searchEvents(criteria) {
    const query = new SearchEventsQuery(criteria);
    return await this.queryBus.execute(query);
  }

  async getProjection(name) {
    const query = new GetProjectionQuery(name);
    return await this.queryBus.execute(query);
  }

  async getSaga(sagaId) {
    const query = new GetSagaQuery(sagaId);
    return await this.queryBus.execute(query);
  }

  async getEventStatistics(criteria) {
    const query = new GetEventStatisticsQuery(criteria);
    return await this.queryBus.execute(query);
  }

  async getCorrelatedEvents(correlationId) {
    const query = new GetCorrelatedEventsQuery(correlationId);
    return await this.queryBus.execute(query);
  }

  async getEventStoreHealth() {
    const query = new GetEventStoreHealthQuery();
    return await this.queryBus.execute(query);
  }

  async getEventStoreMetrics() {
    const query = new GetEventStoreMetricsQuery();
    return await this.queryBus.execute(query);
  }

  async getEventStoreAlerts(filters) {
    const query = new GetEventStoreAlertsQuery(filters);
    return await this.queryBus.execute(query);
  }

  async getEventStoreBackups(filters) {
    const query = new GetEventStoreBackupsQuery(filters);
    return await this.queryBus.execute(query);
  }

  async getEventStoreReports(filters) {
    const query = new GetEventStoreReportsQuery(filters);
    return await this.queryBus.execute(query);
  }

  async getEventStoreSettings() {
    const query = new GetEventStoreSettingsQuery();
    return await this.queryBus.execute(query);
  }

  async getEventStoreAuditLog(filters) {
    const query = new GetEventStoreAuditLogQuery(filters);
    return await this.queryBus.execute(query);
  }

  async getEventStorePerformanceMetrics(timeRange) {
    const query = new GetEventStorePerformanceMetricsQuery(timeRange);
    return await this.queryBus.execute(query);
  }

  async getEventStoreStorageMetrics() {
    const query = new GetEventStoreStorageMetricsQuery();
    return await this.queryBus.execute(query);
  }

  // Utility methods
  getStats() {
    return {
      totalAggregates: this.eventStore.size,
      totalEvents: Array.from(this.eventStore.values()).reduce((sum, events) => sum + events.length, 0),
      initialized: this.isInitialized,
      timestamp: new Date().toISOString()
    };
  }

  async healthCheck() {
    try {
      const health = await this.getEventStoreHealth();
      return {
        status: health.success ? 'healthy' : 'unhealthy',
        ...health.data
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}