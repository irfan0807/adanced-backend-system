// Event Store Queries
export class GetEventsForAggregateQuery {
  constructor(aggregateId, fromVersion, toVersion, limit) {
    this.aggregateId = aggregateId;
    this.fromVersion = fromVersion;
    this.toVersion = toVersion;
    this.limit = limit;
  }
}

export class GetEventsQuery {
  constructor(filters) {
    this.filters = filters; // { aggregateType, eventType, startDate, endDate, page, limit }
  }
}

export class GetSnapshotQuery {
  constructor(aggregateId) {
    this.aggregateId = aggregateId;
  }
}

export class RebuildAggregateStateQuery {
  constructor(aggregateId) {
    this.aggregateId = aggregateId;
  }
}

export class SearchEventsQuery {
  constructor(criteria) {
    this.criteria = criteria; // { query, aggregateType, eventType, startDate, endDate, page, limit }
  }
}

export class GetProjectionQuery {
  constructor(name) {
    this.name = name;
  }
}

export class GetSagaQuery {
  constructor(sagaId) {
    this.sagaId = sagaId;
  }
}

export class GetEventStatisticsQuery {
  constructor(criteria) {
    this.criteria = criteria; // { aggregateType, startDate, endDate }
  }
}

export class GetCorrelatedEventsQuery {
  constructor(correlationId) {
    this.correlationId = correlationId;
  }
}

export class GetEventStoreHealthQuery {
  constructor() {}
}

export class GetEventStoreMetricsQuery {
  constructor() {}
}

export class GetEventStoreAlertsQuery {
  constructor(filters) {
    this.filters = filters; // { severity, startDate, endDate, page, limit }
  }
}

export class GetEventStoreBackupsQuery {
  constructor(filters) {
    this.filters = filters; // { backupType, startDate, endDate, page, limit }
  }
}

export class GetEventStoreReportsQuery {
  constructor(filters) {
    this.filters = filters; // { reportType, startDate, endDate, page, limit }
  }
}

export class GetEventStoreSettingsQuery {
  constructor() {}
}

export class GetEventStoreAuditLogQuery {
  constructor(filters) {
    this.filters = filters; // { action, userId, startDate, endDate, page, limit }
  }
}

export class GetEventStorePerformanceMetricsQuery {
  constructor(timeRange) {
    this.timeRange = timeRange; // { startDate, endDate }
  }
}

export class GetEventStoreStorageMetricsQuery {
  constructor() {}
}