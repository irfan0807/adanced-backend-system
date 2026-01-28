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
} from '../queries/event-store-queries.js';

export class EventStoreQueryHandler {
  constructor(dependencies) {
    this.connectionPool = dependencies.connectionPool;
    this.dualWriter = dependencies.dualWriter;
    this.logger = dependencies.logger;
    this.eventStore = dependencies.eventStore;
  }

  async handle(query) {
    const queryType = query.constructor.name;

    switch (queryType) {
      case 'GetEventsForAggregateQuery':
        return await this.handleGetEventsForAggregate(query);
      case 'GetEventsQuery':
        return await this.handleGetEvents(query);
      case 'GetSnapshotQuery':
        return await this.handleGetSnapshot(query);
      case 'RebuildAggregateStateQuery':
        return await this.handleRebuildAggregateState(query);
      case 'SearchEventsQuery':
        return await this.handleSearchEvents(query);
      case 'GetProjectionQuery':
        return await this.handleGetProjection(query);
      case 'GetSagaQuery':
        return await this.handleGetSaga(query);
      case 'GetEventStatisticsQuery':
        return await this.handleGetEventStatistics(query);
      case 'GetCorrelatedEventsQuery':
        return await this.handleGetCorrelatedEvents(query);
      case 'GetEventStoreHealthQuery':
        return await this.handleGetEventStoreHealth(query);
      case 'GetEventStoreMetricsQuery':
        return await this.handleGetEventStoreMetrics(query);
      case 'GetEventStoreAlertsQuery':
        return await this.handleGetEventStoreAlerts(query);
      case 'GetEventStoreBackupsQuery':
        return await this.handleGetEventStoreBackups(query);
      case 'GetEventStoreReportsQuery':
        return await this.handleGetEventStoreReports(query);
      case 'GetEventStoreSettingsQuery':
        return await this.handleGetEventStoreSettings(query);
      case 'GetEventStoreAuditLogQuery':
        return await this.handleGetEventStoreAuditLog(query);
      case 'GetEventStorePerformanceMetricsQuery':
        return await this.handleGetEventStorePerformanceMetrics(query);
      case 'GetEventStoreStorageMetricsQuery':
        return await this.handleGetEventStoreStorageMetrics(query);
      default:
        throw new Error(`Unknown query type: ${queryType}`);
    }
  }

  async handleGetEventsForAggregate(query) {
    const { aggregateId, fromVersion, toVersion, limit } = query;

    try {
      const events = await this.getEventsForAggregate(aggregateId, {
        fromVersion: fromVersion || 1,
        toVersion,
        limit: limit || 1000
      });

      return {
        success: true,
        data: events,
        count: events.length
      };
    } catch (error) {
      this.logger.error('Error getting events for aggregate:', error);
      throw error;
    }
  }

  async handleGetEvents(query) {
    const { filters } = query;

    try {
      const events = await this.getEvents(filters);

      return {
        success: true,
        data: events,
        pagination: {
          page: filters.page || 1,
          limit: filters.limit || 20,
          total: events.length // In production, you'd want a separate COUNT query
        }
      };
    } catch (error) {
      this.logger.error('Error getting events:', error);
      throw error;
    }
  }

  async handleGetSnapshot(query) {
    const { aggregateId } = query;

    try {
      const snapshot = await this.getSnapshot(aggregateId);

      if (!snapshot) {
        return {
          success: false,
          error: 'Snapshot not found'
        };
      }

      return {
        success: true,
        data: snapshot
      };
    } catch (error) {
      this.logger.error('Error getting snapshot:', error);
      throw error;
    }
  }

  async handleRebuildAggregateState(query) {
    const { aggregateId } = query;

    try {
      const state = await this.rebuildAggregateState(aggregateId);

      return {
        success: true,
        data: state
      };
    } catch (error) {
      this.logger.error('Error rebuilding aggregate state:', error);
      throw error;
    }
  }

  async handleSearchEvents(query) {
    const { criteria } = query;

    try {
      const results = await this.searchEvents(criteria);

      return {
        success: true,
        data: results
      };
    } catch (error) {
      this.logger.error('Error searching events:', error);
      throw error;
    }
  }

  async handleGetProjection(query) {
    const { name } = query;

    try {
      const projection = await this.getProjection(name);

      if (!projection) {
        return {
          success: false,
          error: 'Projection not found'
        };
      }

      return {
        success: true,
        data: projection
      };
    } catch (error) {
      this.logger.error('Error getting projection:', error);
      throw error;
    }
  }

  async handleGetSaga(query) {
    const { sagaId } = query;

    try {
      const saga = await this.getSaga(sagaId);

      if (!saga) {
        return {
          success: false,
          error: 'Saga not found'
        };
      }

      return {
        success: true,
        data: saga
      };
    } catch (error) {
      this.logger.error('Error getting saga:', error);
      throw error;
    }
  }

  async handleGetEventStatistics(query) {
    const { criteria } = query;

    try {
      const statistics = await this.getEventStatistics(criteria);

      return {
        success: true,
        data: statistics
      };
    } catch (error) {
      this.logger.error('Error getting event statistics:', error);
      throw error;
    }
  }

  async handleGetCorrelatedEvents(query) {
    const { correlationId } = query;

    try {
      const correlatedEvents = await this.getCorrelatedEvents(correlationId);

      return {
        success: true,
        data: correlatedEvents
      };
    } catch (error) {
      this.logger.error('Error getting correlated events:', error);
      throw error;
    }
  }

  async handleGetEventStoreHealth(query) {
    try {
      const health = {
        status: 'healthy',
        service: 'event-store-service',
        timestamp: new Date().toISOString(),
        dependencies: {
          database: this.connectionPool.getStats(),
          dualWriter: this.dualWriter.getStats()
        },
        stats: {
          totalAggregates: this.eventStore.size,
          totalEvents: Array.from(this.eventStore.values()).reduce((sum, events) => sum + events.length, 0)
        }
      };

      return {
        success: true,
        data: health
      };
    } catch (error) {
      this.logger.error('Error getting event store health:', error);
      throw error;
    }
  }

  async handleGetEventStoreMetrics(query) {
    try {
      const metrics = {
        service: 'event-store-service',
        timestamp: new Date().toISOString(),
        database: this.connectionPool.getStats(),
        dualWriter: this.dualWriter.getStats(),
        eventStore: {
          totalAggregates: this.eventStore.size,
          totalEvents: Array.from(this.eventStore.values()).reduce((sum, events) => sum + events.length, 0)
        }
      };

      return {
        success: true,
        data: metrics
      };
    } catch (error) {
      this.logger.error('Error getting event store metrics:', error);
      throw error;
    }
  }

  async handleGetEventStoreAlerts(query) {
    const { filters } = query;

    try {
      // In a real implementation, you'd query the alerts from database
      const alerts = []; // Placeholder

      return {
        success: true,
        data: alerts,
        pagination: {
          page: filters.page || 1,
          limit: filters.limit || 20,
          total: alerts.length
        }
      };
    } catch (error) {
      this.logger.error('Error getting event store alerts:', error);
      throw error;
    }
  }

  async handleGetEventStoreBackups(query) {
    const { filters } = query;

    try {
      // In a real implementation, you'd query the backups from database
      const backups = []; // Placeholder

      return {
        success: true,
        data: backups,
        pagination: {
          page: filters.page || 1,
          limit: filters.limit || 20,
          total: backups.length
        }
      };
    } catch (error) {
      this.logger.error('Error getting event store backups:', error);
      throw error;
    }
  }

  async handleGetEventStoreReports(query) {
    const { filters } = query;

    try {
      // In a real implementation, you'd query the reports from database
      const reports = []; // Placeholder

      return {
        success: true,
        data: reports,
        pagination: {
          page: filters.page || 1,
          limit: filters.limit || 20,
          total: reports.length
        }
      };
    } catch (error) {
      this.logger.error('Error getting event store reports:', error);
      throw error;
    }
  }

  async handleGetEventStoreSettings(query) {
    try {
      // In a real implementation, you'd retrieve settings from database or config
      const settings = {
        retentionPeriod: '7years',
        maxEventsPerAggregate: 10000,
        enableSnapshots: true,
        enableProjections: true,
        enableSagas: true,
        backupFrequency: 'daily'
      };

      return {
        success: true,
        data: settings
      };
    } catch (error) {
      this.logger.error('Error getting event store settings:', error);
      throw error;
    }
  }

  async handleGetEventStoreAuditLog(query) {
    const { filters } = query;

    try {
      // In a real implementation, you'd query the audit log from database
      const auditLog = []; // Placeholder

      return {
        success: true,
        data: auditLog,
        pagination: {
          page: filters.page || 1,
          limit: filters.limit || 20,
          total: auditLog.length
        }
      };
    } catch (error) {
      this.logger.error('Error getting event store audit log:', error);
      throw error;
    }
  }

  async handleGetEventStorePerformanceMetrics(query) {
    const { timeRange } = query;

    try {
      // In a real implementation, you'd calculate performance metrics
      const performanceMetrics = {
        timeRange: timeRange || { startDate: '2024-01-01', endDate: new Date().toISOString() },
        averageResponseTime: 45, // ms
        throughput: 1250, // events per minute
        errorRate: 0.02, // 2%
        peakLoadTime: '14:30:00',
        slowestQueries: []
      };

      return {
        success: true,
        data: performanceMetrics
      };
    } catch (error) {
      this.logger.error('Error getting event store performance metrics:', error);
      throw error;
    }
  }

  async handleGetEventStoreStorageMetrics(query) {
    try {
      // In a real implementation, you'd calculate storage metrics
      const storageMetrics = {
        totalEvents: 150000,
        totalSize: '2.5GB',
        averageEventSize: '1.2KB',
        compressionRatio: 0.75,
        storageGrowthRate: '5MB/day',
        retentionPolicy: '7years',
        archivedEvents: 50000
      };

      return {
        success: true,
        data: storageMetrics
      };
    } catch (error) {
      this.logger.error('Error getting event store storage metrics:', error);
      throw error;
    }
  }

  // Helper methods (extracted from original server.js)
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

  async getEvents(filters) {
    try {
      const { aggregateType, eventType, startDate, endDate, page, limit } = filters;

      let whereClause = [];
      let params = [];

      if (aggregateType) {
        whereClause.push('aggregate_type = ?');
        params.push(aggregateType);
      }

      if (eventType) {
        whereClause.push('event_type = ?');
        params.push(eventType);
      }

      if (startDate) {
        whereClause.push('timestamp >= ?');
        params.push(startDate);
      }

      if (endDate) {
        whereClause.push('timestamp <= ?');
        params.push(endDate);
      }

      const whereStr = whereClause.length > 0 ? `WHERE ${whereClause.join(' AND ')}` : '';
      const offset = (page - 1) * limit;

      const events = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute(
          `SELECT * FROM events ${whereStr} ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
          [...params, limit, offset]
        );
        return rows;
      });

      return events.map(event => ({
        id: event.id,
        aggregateId: event.aggregate_id,
        aggregateType: event.aggregate_type,
        eventType: event.event_type,
        eventData: JSON.parse(event.event_data),
        metadata: JSON.parse(event.metadata || '{}'),
        version: event.version,
        timestamp: event.timestamp
      }));
    } catch (error) {
      this.logger.error('Error getting events:', error);
      throw error;
    }
  }

  async getSnapshot(aggregateId) {
    try {
      const snapshot = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute(
          'SELECT * FROM snapshots WHERE aggregate_id = ? ORDER BY version DESC LIMIT 1',
          [aggregateId]
        );
        return rows[0];
      });

      if (!snapshot) return null;

      return {
        id: snapshot.id,
        aggregateId: snapshot.aggregate_id,
        state: JSON.parse(snapshot.state),
        version: snapshot.version,
        createdAt: snapshot.created_at
      };
    } catch (error) {
      this.logger.error('Error getting snapshot:', error);
      throw error;
    }
  }

  async rebuildAggregateState(aggregateId) {
    const events = await this.getEventsForAggregate(aggregateId, {});

    // Replay logic - apply events to rebuild state
    let state = {};

    for (const event of events) {
      // Apply event to state based on event type
      state = this.applyEvent(state, event);
    }

    return state;
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

  async searchEvents(criteria) {
    const { query, aggregateType, eventType, startDate, endDate, page, limit } = criteria;

    let sql = 'SELECT * FROM events WHERE 1=1';
    const params = [];

    if (query) {
      sql += ' AND (data LIKE ? OR metadata LIKE ?)';
      params.push(`%${query}%`, `%${query}%`);
    }

    if (aggregateType) {
      sql += ' AND aggregate_type = ?';
      params.push(aggregateType);
    }

    if (eventType) {
      sql += ' AND event_type = ?';
      params.push(eventType);
    }

    if (startDate) {
      sql += ' AND timestamp >= ?';
      params.push(startDate);
    }

    if (endDate) {
      sql += ' AND timestamp <= ?';
      params.push(endDate);
    }

    sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, (page - 1) * limit);

    const result = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(sql, params);
      return rows;
    });

    return {
      events: result.map(row => ({
        ...row,
        data: JSON.parse(row.data),
        metadata: JSON.parse(row.metadata || '{}')
      })),
      pagination: {
        page,
        limit,
        total: result.length // In production, you'd want a separate COUNT query
      }
    };
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

  async getEventStatistics(criteria) {
    const { aggregateType, startDate, endDate } = criteria;

    let sql = `
      SELECT
        COUNT(*) as totalEvents,
        COUNT(DISTINCT aggregate_id) as uniqueAggregates,
        COUNT(DISTINCT event_type) as uniqueEventTypes,
        MIN(timestamp) as firstEvent,
        MAX(timestamp) as lastEvent
      FROM events
      WHERE 1=1
    `;
    const params = [];

    if (aggregateType) {
      sql += ' AND aggregate_type = ?';
      params.push(aggregateType);
    }

    if (startDate) {
      sql += ' AND timestamp >= ?';
      params.push(startDate);
    }

    if (endDate) {
      sql += ' AND timestamp <= ?';
      params.push(endDate);
    }

    const stats = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(sql, params);
      return rows[0];
    });

    // Get event type breakdown
    const eventTypeSql = `
      SELECT event_type, COUNT(*) as count
      FROM events
      WHERE 1=1
    `;
    const eventTypeParams = [...params];

    if (aggregateType) {
      eventTypeSql += ' AND aggregate_type = ?';
    }

    if (startDate) {
      eventTypeSql += ' AND timestamp >= ?';
    }

    if (endDate) {
      eventTypeSql += ' AND timestamp <= ?';
    }

    eventTypeSql += ' GROUP BY event_type ORDER BY count DESC';

    const eventTypes = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(eventTypeSql, eventTypeParams);
      return rows;
    });

    return {
      ...stats,
      eventTypeBreakdown: eventTypes
    };
  }

  async getCorrelatedEvents(correlationId) {
    const events = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT * FROM events WHERE correlation_id = ? ORDER BY timestamp ASC',
        [correlationId]
      );
      return rows;
    });

    return events.map(event => ({
      ...event,
      data: JSON.parse(event.data),
      metadata: JSON.parse(event.metadata || '{}')
    }));
  }
}