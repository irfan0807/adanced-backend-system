import { v4 as uuidv4 } from 'uuid';
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
} from '../commands/event-store-commands.js';

import {
  EventStoredEvent,
  EventsBatchStoredEvent,
  EventsReplayedEvent,
  SnapshotCreatedEvent,
  ProjectionCreatedEvent,
  ProjectionUpdatedEvent,
  SagaCreatedEvent,
  SagaStepCompletedEvent,
  SagaCompletedEvent,
  SagaFailedEvent,
  EventsArchivedEvent,
  EventValidationPerformedEvent,
  EventsTransformedEvent,
  EventStoreAlertCreatedEvent,
  EventStoreSettingsUpdatedEvent,
  EventStoreBackupCreatedEvent,
  EventStoreRestoredEvent,
  EventStoreDataPurgedEvent,
  EventStoreReportGeneratedEvent
} from '../events/event-store-events.js';

export class EventStoreCommandHandler {
  constructor(dependencies) {
    this.connectionPool = dependencies.connectionPool;
    this.dualWriter = dependencies.dualWriter;
    this.kafkaService = dependencies.kafkaService;
    this.logger = dependencies.logger;
    this.eventStore = new Map(); // In-memory store for replay capabilities
  }

  async handle(command) {
    const commandType = command.constructor.name;

    switch (commandType) {
      case 'StoreEventCommand':
        return await this.handleStoreEvent(command);
      case 'StoreEventsBatchCommand':
        return await this.handleStoreEventsBatch(command);
      case 'ReplayEventsCommand':
        return await this.handleReplayEvents(command);
      case 'CreateSnapshotCommand':
        return await this.handleCreateSnapshot(command);
      case 'CreateProjectionCommand':
        return await this.handleCreateProjection(command);
      case 'UpdateProjectionCommand':
        return await this.handleUpdateProjection(command);
      case 'CreateSagaCommand':
        return await this.handleCreateSaga(command);
      case 'ProcessSagaEventCommand':
        return await this.handleProcessSagaEvent(command);
      case 'ArchiveEventsCommand':
        return await this.handleArchiveEvents(command);
      case 'ValidateEventCommand':
        return await this.handleValidateEvent(command);
      case 'TransformEventsCommand':
        return await this.handleTransformEvents(command);
      case 'CreateEventStoreAlertCommand':
        return await this.handleCreateEventStoreAlert(command);
      case 'UpdateEventStoreSettingsCommand':
        return await this.handleUpdateEventStoreSettings(command);
      case 'CreateEventStoreBackupCommand':
        return await this.handleCreateEventStoreBackup(command);
      case 'RestoreEventStoreCommand':
        return await this.handleRestoreEventStore(command);
      case 'PurgeEventStoreDataCommand':
        return await this.handlePurgeEventStoreData(command);
      case 'CreateEventStoreReportCommand':
        return await this.handleCreateEventStoreReport(command);
      default:
        throw new Error(`Unknown command type: ${commandType}`);
    }
  }

  async handleStoreEvent(command) {
    const { aggregateId, aggregateType, eventType, eventData, metadata } = command;

    try {
      // Get next version
      const version = await this.getNextVersion(aggregateId);

      const event = {
        id: uuidv4(),
        aggregateId,
        aggregateType,
        eventType,
        eventData,
        metadata: metadata || {},
        version,
        timestamp: new Date().toISOString()
      };

      // Write to databases
      await this.dualWriter.writeToAllDatabases(event);

      // Store in memory for replay
      if (!this.eventStore.has(aggregateId)) {
        this.eventStore.set(aggregateId, []);
      }
      this.eventStore.get(aggregateId).push(event);

      // Publish event stored
      await this.kafkaService.produce('event-store-events', {
        eventType: 'EVENT_STORED',
        eventId: event.id,
        aggregateId: event.aggregateId,
        aggregateType: event.aggregateType,
        timestamp: event.timestamp
      });

      // Publish domain event
      const eventStoredEvent = new EventStoredEvent(
        event.id,
        aggregateId,
        aggregateType,
        eventType,
        version,
        event.timestamp
      );

      return {
        success: true,
        data: event,
        event: eventStoredEvent
      };
    } catch (error) {
      this.logger.error('Error storing event:', error);
      throw error;
    }
  }

  async handleStoreEventsBatch(command) {
    const { events } = command;

    try {
      const storedEvents = await this.storeEventsBatch(events);
      const eventIds = storedEvents.map(e => e.id);
      const aggregateIds = [...new Set(storedEvents.map(e => e.aggregateId))];

      const eventsBatchStoredEvent = new EventsBatchStoredEvent(
        eventIds,
        aggregateIds,
        storedEvents.length,
        new Date().toISOString()
      );

      return {
        success: true,
        data: storedEvents,
        event: eventsBatchStoredEvent
      };
    } catch (error) {
      this.logger.error('Error storing event batch:', error);
      throw error;
    }
  }

  async handleReplayEvents(command) {
    const { aggregateId, fromVersion, toVersion } = command;

    try {
      const events = await this.getEventsForAggregate(aggregateId, {
        fromVersion: fromVersion || 1,
        toVersion
      });

      // Replay logic - apply events to rebuild state
      let state = {};
      for (const event of events) {
        state = this.applyEvent(state, event);
      }

      const result = {
        aggregateId,
        finalState: state,
        eventsReplayed: events.length,
        lastVersion: events.length > 0 ? events[events.length - 1].version : 0
      };

      const eventsReplayedEvent = new EventsReplayedEvent(
        aggregateId,
        events.length,
        result.lastVersion,
        new Date().toISOString()
      );

      return {
        success: true,
        data: result,
        event: eventsReplayedEvent
      };
    } catch (error) {
      this.logger.error('Error replaying events:', error);
      throw error;
    }
  }

  async handleCreateSnapshot(command) {
    const { aggregateId, state, version } = command;

    try {
      const snapshot = {
        id: uuidv4(),
        aggregateId,
        state,
        version,
        createdAt: new Date().toISOString()
      };

      // Write to databases
      await this.dualWriter.writeToAllDatabases(snapshot);

      const snapshotCreatedEvent = new SnapshotCreatedEvent(
        snapshot.id,
        aggregateId,
        version,
        snapshot.createdAt
      );

      return {
        success: true,
        data: snapshot,
        event: snapshotCreatedEvent
      };
    } catch (error) {
      this.logger.error('Error creating snapshot:', error);
      throw error;
    }
  }

  async handleCreateProjection(command) {
    const { name, aggregateType, eventTypes, initialState } = command;

    try {
      const projection = await this.createProjection(name, {
        aggregateType,
        eventTypes,
        initialState
      });

      const projectionCreatedEvent = new ProjectionCreatedEvent(
        projection.id,
        name,
        aggregateType,
        new Date().toISOString()
      );

      return {
        success: true,
        data: projection,
        event: projectionCreatedEvent
      };
    } catch (error) {
      this.logger.error('Error creating projection:', error);
      throw error;
    }
  }

  async handleUpdateProjection(command) {
    const { name, rebuild } = command;

    try {
      const result = await this.updateProjection(name, { rebuild });

      const projectionUpdatedEvent = new ProjectionUpdatedEvent(
        null, // projectionId not returned from update
        name,
        rebuild,
        new Date().toISOString()
      );

      return {
        success: true,
        data: result,
        event: projectionUpdatedEvent
      };
    } catch (error) {
      this.logger.error('Error updating projection:', error);
      throw error;
    }
  }

  async handleCreateSaga(command) {
    const { sagaType, initiatingEvent, steps } = command;

    try {
      const saga = await this.createSaga({
        sagaType,
        initiatingEvent,
        steps
      });

      const sagaCreatedEvent = new SagaCreatedEvent(
        saga.id,
        sagaType,
        new Date().toISOString()
      );

      return {
        success: true,
        data: saga,
        event: sagaCreatedEvent
      };
    } catch (error) {
      this.logger.error('Error creating saga:', error);
      throw error;
    }
  }

  async handleProcessSagaEvent(command) {
    const { sagaId, eventType, eventData } = command;

    try {
      const result = await this.processSagaEvent(sagaId, {
        eventType,
        eventData
      });

      let event;
      if (result.status === 'completed') {
        event = new SagaCompletedEvent(sagaId, new Date().toISOString());
      } else if (result.status === 'failed') {
        event = new SagaFailedEvent(sagaId, result.message, new Date().toISOString());
      } else {
        event = new SagaStepCompletedEvent(sagaId, result.currentStep - 1, eventType, new Date().toISOString());
      }

      return {
        success: true,
        data: result,
        event
      };
    } catch (error) {
      this.logger.error('Error processing saga event:', error);
      throw error;
    }
  }

  async handleArchiveEvents(command) {
    const { aggregateType, beforeDate, archivePath } = command;

    try {
      const result = await this.archiveEvents({
        aggregateType,
        beforeDate,
        archivePath
      });

      const eventsArchivedEvent = new EventsArchivedEvent(
        aggregateType,
        result.archived,
        beforeDate,
        new Date().toISOString()
      );

      return {
        success: true,
        data: result,
        event: eventsArchivedEvent
      };
    } catch (error) {
      this.logger.error('Error archiving events:', error);
      throw error;
    }
  }

  async handleValidateEvent(command) {
    const { event } = command;

    try {
      const validation = await this.validateEvent(event);

      const eventValidationPerformedEvent = new EventValidationPerformedEvent(
        event.id || 'unknown',
        validation.valid,
        validation.errors.length,
        new Date().toISOString()
      );

      return {
        success: true,
        data: validation,
        event: eventValidationPerformedEvent
      };
    } catch (error) {
      this.logger.error('Error validating event:', error);
      throw error;
    }
  }

  async handleTransformEvents(command) {
    const { events, transformation } = command;

    try {
      const transformedEvents = await this.transformEvents(events, transformation);

      const eventsTransformedEvent = new EventsTransformedEvent(
        transformedEvents.length,
        transformation.type || 'unknown',
        new Date().toISOString()
      );

      return {
        success: true,
        data: transformedEvents,
        event: eventsTransformedEvent
      };
    } catch (error) {
      this.logger.error('Error transforming events:', error);
      throw error;
    }
  }

  async handleCreateEventStoreAlert(command) {
    const { alertType, message, severity, metadata } = command;

    try {
      const alert = {
        id: uuidv4(),
        alertType,
        message,
        severity,
        metadata: metadata || {},
        createdAt: new Date().toISOString(),
        acknowledged: false
      };

      await this.dualWriter.writeToAllDatabases(alert);

      const eventStoreAlertCreatedEvent = new EventStoreAlertCreatedEvent(
        alert.id,
        alertType,
        severity,
        alert.createdAt
      );

      return {
        success: true,
        data: alert,
        event: eventStoreAlertCreatedEvent
      };
    } catch (error) {
      this.logger.error('Error creating event store alert:', error);
      throw error;
    }
  }

  async handleUpdateEventStoreSettings(command) {
    const { settings } = command;

    try {
      // In a real implementation, you'd persist these settings
      const eventStoreSettingsUpdatedEvent = new EventStoreSettingsUpdatedEvent(
        settings,
        new Date().toISOString()
      );

      return {
        success: true,
        data: { settings, updated: true },
        event: eventStoreSettingsUpdatedEvent
      };
    } catch (error) {
      this.logger.error('Error updating event store settings:', error);
      throw error;
    }
  }

  async handleCreateEventStoreBackup(command) {
    const { backupType, options } = command;

    try {
      const backup = {
        id: uuidv4(),
        backupType,
        options: options || {},
        createdAt: new Date().toISOString(),
        status: 'in_progress'
      };

      await this.dualWriter.writeToAllDatabases(backup);

      const eventStoreBackupCreatedEvent = new EventStoreBackupCreatedEvent(
        backup.id,
        backupType,
        backup.createdAt
      );

      return {
        success: true,
        data: backup,
        event: eventStoreBackupCreatedEvent
      };
    } catch (error) {
      this.logger.error('Error creating event store backup:', error);
      throw error;
    }
  }

  async handleRestoreEventStore(command) {
    const { backupId, options } = command;

    try {
      const eventStoreRestoredEvent = new EventStoreRestoredEvent(
        backupId,
        new Date().toISOString()
      );

      return {
        success: true,
        data: { backupId, restored: true, options },
        event: eventStoreRestoredEvent
      };
    } catch (error) {
      this.logger.error('Error restoring event store:', error);
      throw error;
    }
  }

  async handlePurgeEventStoreData(command) {
    const { criteria, reason } = command;

    try {
      // In a real implementation, you'd actually purge the data
      const eventStoreDataPurgedEvent = new EventStoreDataPurgedEvent(
        criteria,
        0, // count would be returned from actual purge operation
        reason,
        new Date().toISOString()
      );

      return {
        success: true,
        data: { criteria, purged: true, reason },
        event: eventStoreDataPurgedEvent
      };
    } catch (error) {
      this.logger.error('Error purging event store data:', error);
      throw error;
    }
  }

  async handleCreateEventStoreReport(command) {
    const { reportType, parameters } = command;

    try {
      const report = {
        id: uuidv4(),
        reportType,
        parameters: parameters || {},
        createdAt: new Date().toISOString(),
        status: 'generating'
      };

      await this.dualWriter.writeToAllDatabases(report);

      const eventStoreReportGeneratedEvent = new EventStoreReportGeneratedEvent(
        report.id,
        reportType,
        report.createdAt
      );

      return {
        success: true,
        data: report,
        event: eventStoreReportGeneratedEvent
      };
    } catch (error) {
      this.logger.error('Error creating event store report:', error);
      throw error;
    }
  }

  // Helper methods (extracted from original server.js)
  async getNextVersion(aggregateId) {
    const events = this.eventStore.get(aggregateId) || [];
    return events.length + 1;
  }

  async getEventsForAggregate(aggregateId, options) {
    const { fromVersion = 1, toVersion, limit = 1000 } = options;

    let query = `
      SELECT * FROM events
      WHERE aggregate_id = ?
      AND version >= ?
      ORDER BY version ASC
    `;
    let params = [aggregateId, fromVersion];

    if (toVersion) {
      query += ' AND version <= ?';
      params.push(toVersion);
    }

    query += ' LIMIT ?';
    params.push(limit);

    const events = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(query, params);
      return rows;
    });

    return events.map(row => ({
      ...row,
      data: JSON.parse(row.data),
      metadata: JSON.parse(row.metadata || '{}')
    }));
  }

  async storeEventsBatch(events) {
    return await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      await connection.beginTransaction();

      const storedEvents = [];

      try {
        for (const event of events) {
          // Check for duplicates
          const [existing] = await connection.execute(
            'SELECT id FROM events WHERE aggregate_id = ? AND version = ?',
            [event.aggregateId, event.version]
          );

          if (existing.length > 0) {
            throw new Error(`Event already exists: ${event.aggregateId}:${event.version}`);
          }

          const eventId = uuidv4();
          const timestamp = new Date().toISOString();

          await connection.execute(
            `INSERT INTO events (id, aggregate_id, aggregate_type, event_type, version, data, metadata, timestamp, correlation_id, causation_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              eventId,
              event.aggregateId,
              event.aggregateType,
              event.eventType,
              event.version,
              JSON.stringify(event.data),
              JSON.stringify(event.metadata || {}),
              timestamp,
              event.correlationId || null,
              event.causationId || null
            ]
          );

          storedEvents.push({
            id: eventId,
            ...event,
            timestamp
          });
        }

        await connection.commit();
        return storedEvents;

      } catch (error) {
        await connection.rollback();
        throw error;
      }
    });
  }

  applyEvent(state, event) {
    // Event application logic based on aggregate type and event type
    switch (event.aggregateType) {
      case 'Transaction':
        return this.applyTransactionEvent(state, event);
      case 'User':
        return this.applyUserEvent(state, event);
      case 'Account':
        return this.applyAccountEvent(state, event);
      default:
        // Generic application for unknown aggregate types
        return { ...state, ...event.eventData };
    }
  }

  applyTransactionEvent(state, event) {
    switch (event.eventType) {
      case 'TransactionCreated':
        return {
          id: event.aggregateId,
          userId: event.eventData.userId,
          amount: event.eventData.amount,
          currency: event.eventData.currency,
          type: event.eventData.type,
          status: 'pending',
          createdAt: event.timestamp,
          updatedAt: event.timestamp,
          ...event.eventData
        };
      case 'TransactionStatusUpdated':
        return {
          ...state,
          status: event.eventData.newStatus,
          updatedAt: event.timestamp,
          statusHistory: [
            ...(state.statusHistory || []),
            {
              status: event.eventData.newStatus,
              timestamp: event.timestamp,
              reason: event.eventData.reason
            }
          ]
        };
      case 'TransactionAmountUpdated':
        return {
          ...state,
          amount: event.eventData.newAmount,
          updatedAt: event.timestamp,
          amountHistory: [
            ...(state.amountHistory || []),
            {
              amount: event.eventData.newAmount,
              oldAmount: event.eventData.oldAmount,
              timestamp: event.timestamp,
              reason: event.eventData.reason
            }
          ]
        };
      case 'TransactionCancelled':
        return {
          ...state,
          status: 'cancelled',
          cancelledAt: event.timestamp,
          cancelledBy: event.eventData.cancelledBy,
          cancellationReason: event.eventData.reason,
          updatedAt: event.timestamp
        };
      default:
        return state;
    }
  }

  applyUserEvent(state, event) {
    switch (event.eventType) {
      case 'UserCreated':
        return {
          id: event.aggregateId,
          ...event.eventData,
          createdAt: event.timestamp,
          updatedAt: event.timestamp
        };
      case 'UserUpdated':
        return {
          ...state,
          ...event.eventData,
          updatedAt: event.timestamp
        };
      default:
        return state;
    }
  }

  applyAccountEvent(state, event) {
    switch (event.eventType) {
      case 'AccountCreated':
        return {
          id: event.aggregateId,
          ...event.eventData,
          balance: 0,
          createdAt: event.timestamp,
          updatedAt: event.timestamp
        };
      case 'AccountBalanceUpdated':
        return {
          ...state,
          balance: event.eventData.newBalance,
          updatedAt: event.timestamp,
          balanceHistory: [
            ...(state.balanceHistory || []),
            {
              balance: event.eventData.newBalance,
              timestamp: event.timestamp,
              reason: event.eventData.reason
            }
          ]
        };
      default:
        return state;
    }
  }

  async createProjection(name, config) {
    const { aggregateType, eventTypes, initialState } = config;

    const projectionId = uuidv4();

    await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      await connection.execute(
        `INSERT INTO projections (id, name, aggregate_type, event_types, state, last_event_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NULL, NOW(), NOW())`,
        [
          projectionId,
          name,
          aggregateType,
          JSON.stringify(eventTypes),
          JSON.stringify(initialState)
        ]
      );
    });

    return {
      id: projectionId,
      name,
      ...config,
      state: initialState,
      createdAt: new Date()
    };
  }

  async updateProjection(name, options = {}) {
    const projection = await this.getProjection(name);
    if (!projection) {
      throw new Error('Projection not found');
    }

    if (options.rebuild) {
      // Rebuild projection from scratch
      const eventTypes = projection.eventTypes;
      const events = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute(
          'SELECT * FROM events WHERE aggregate_type = ? AND event_type IN (?) ORDER BY timestamp ASC',
          [projection.aggregate_type, eventTypes]
        );
        return rows;
      });

      let state = JSON.parse(projection.initial_state || '{}');

      for (const event of events) {
        state = this.applyEventToProjection(state, JSON.parse(event.data), event.event_type);
      }

      await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        await connection.execute(
          'UPDATE projections SET state = ?, updated_at = NOW() WHERE name = ?',
          [JSON.stringify(state), name]
        );
      });

      return { rebuilt: true, state };
    }

    return { updated: true };
  }

  applyEventToProjection(state, eventData, eventType) {
    // Simple projection logic - in real implementation, this would be more sophisticated
    switch (eventType) {
      case 'AccountCreated':
        return { ...state, accounts: (state.accounts || 0) + 1 };
      case 'TransactionCompleted':
        return {
          ...state,
          transactions: (state.transactions || 0) + 1,
          totalAmount: (state.totalAmount || 0) + (eventData.amount || 0)
        };
      default:
        return state;
    }
  }

  async getProjection(name) {
    const rows = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT * FROM projections WHERE name = ?',
        [name]
      );
      return rows;
    });

    if (rows.length === 0) return null;

    const row = rows[0];
    return {
      ...row,
      eventTypes: JSON.parse(row.event_types),
      state: JSON.parse(row.state)
    };
  }

  async createSaga(config) {
    const { sagaType, initiatingEvent, steps } = config;

    const sagaId = uuidv4();
    const now = new Date();

    await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      await connection.execute(
        `INSERT INTO sagas (id, saga_type, initiating_event, steps, current_step, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, 'pending', ?, ?)`,
        [
          sagaId,
          sagaType,
          JSON.stringify(initiatingEvent),
          JSON.stringify(steps),
          now,
          now
        ]
      );
    });

    return {
      id: sagaId,
      ...config,
      currentStep: 0,
      status: 'pending',
      createdAt: now
    };
  }

  async processSagaEvent(sagaId, event) {
    const saga = await this.getSaga(sagaId);
    if (!saga) {
      throw new Error('Saga not found');
    }

    const { steps, currentStep, status } = saga;

    if (status === 'completed' || status === 'failed') {
      return { sagaId, status, message: 'Saga already finished' };
    }

    const currentStepConfig = steps[currentStep];
    if (!currentStepConfig) {
      // Saga completed
      await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        await connection.execute(
          'UPDATE sagas SET status = ?, updated_at = NOW() WHERE id = ?',
          ['completed', sagaId]
        );
      });
      return { sagaId, status: 'completed', message: 'Saga completed successfully' };
    }

    // Check if event matches expected event for current step
    if (event.eventType === currentStepConfig.expectedEvent) {
      // Step completed successfully
      const completedSteps = [...(saga.completedSteps || []), {
        step: currentStep,
        event: event.eventType,
        timestamp: new Date()
      }];

      await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        await connection.execute(
          `UPDATE sagas SET current_step = ?, completed_steps = ?, updated_at = NOW() WHERE id = ?`,
          [currentStep + 1, JSON.stringify(completedSteps), sagaId]
        );
      });

      return {
        sagaId,
        status: 'in_progress',
        currentStep: currentStep + 1,
        message: `Step ${currentStep} completed`
      };
    } else if (currentStepConfig.timeout && event.eventType === 'SagaTimeout') {
      // Handle timeout
      const failedSteps = [...(saga.failedSteps || []), {
        step: currentStep,
        reason: 'timeout',
        timestamp: new Date()
      }];

      await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        await connection.execute(
          `UPDATE sagas SET status = ?, failed_steps = ?, updated_at = NOW() WHERE id = ?`,
          ['failed', JSON.stringify(failedSteps), sagaId]
        );
      });

      return { sagaId, status: 'failed', message: 'Saga failed due to timeout' };
    }

    return { sagaId, status: 'in_progress', message: 'Event processed' };
  }

  async getSaga(sagaId) {
    const rows = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT * FROM sagas WHERE id = ?',
        [sagaId]
      );
      return rows;
    });

    if (rows.length === 0) return null;

    const row = rows[0];
    return {
      ...row,
      initiatingEvent: JSON.parse(row.initiating_event),
      steps: JSON.parse(row.steps),
      completedSteps: JSON.parse(row.completed_steps || '[]'),
      failedSteps: JSON.parse(row.failed_steps || '[]')
    };
  }

  async archiveEvents(config) {
    const { aggregateType, beforeDate, archivePath } = config;

    // Get events to archive
    const events = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT * FROM events WHERE aggregate_type = ? AND timestamp < ?',
        [aggregateType, beforeDate]
      );
      return rows;
    });

    if (events.length === 0) {
      return { archived: 0, message: 'No events to archive' };
    }

    // In a real implementation, you'd write to archive storage
    // For now, we'll just mark them as archived
    await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      await connection.execute(
        'UPDATE events SET archived = 1 WHERE aggregate_type = ? AND timestamp < ?',
        [aggregateType, beforeDate]
      );
    });

    return {
      archived: events.length,
      aggregateType,
      beforeDate,
      archivePath
    };
  }

  async validateEvent(event) {
    const errors = [];

    if (!event.aggregateId) errors.push('aggregateId is required');
    if (!event.aggregateType) errors.push('aggregateType is required');
    if (!event.eventType) errors.push('eventType is required');
    if (!event.version || event.version < 1) errors.push('valid version is required');
    if (!event.data) errors.push('data is required');

    // Check version uniqueness
    if (event.aggregateId && event.version) {
      const existing = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute(
          'SELECT id FROM events WHERE aggregate_id = ? AND version = ?',
          [event.aggregateId, event.version]
        );
        return rows;
      });

      if (existing.length > 0) {
        errors.push('Event version already exists for this aggregate');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  async transformEvents(events, transformation) {
    // Simple transformation - in real implementation, this would be more sophisticated
    return events.map(event => {
      const transformed = { ...event };

      if (transformation.maskSensitiveData) {
        if (transformed.data.amount) {
          transformed.data.amount = '***masked***';
        }
        if (transformed.data.accountNumber) {
          transformed.data.accountNumber = transformed.data.accountNumber.substring(0, 4) + '****';
        }
      }

      if (transformation.addMetadata) {
        transformed.metadata = {
          ...transformed.metadata,
          transformed: true,
          transformationType: transformation.type
        };
      }

      return transformed;
    });
  }
}