// Event Store Events
export class EventStoredEvent {
  constructor(eventId, aggregateId, aggregateType, eventType, version, timestamp) {
    this.eventId = eventId;
    this.aggregateId = aggregateId;
    this.aggregateType = aggregateType;
    this.eventType = eventType;
    this.version = version;
    this.timestamp = timestamp;
  }
}

export class EventsBatchStoredEvent {
  constructor(eventIds, aggregateIds, count, timestamp) {
    this.eventIds = eventIds;
    this.aggregateIds = aggregateIds;
    this.count = count;
    this.timestamp = timestamp;
  }
}

export class EventsReplayedEvent {
  constructor(aggregateId, eventsReplayed, finalVersion, timestamp) {
    this.aggregateId = aggregateId;
    this.eventsReplayed = eventsReplayed;
    this.finalVersion = finalVersion;
    this.timestamp = timestamp;
  }
}

export class SnapshotCreatedEvent {
  constructor(snapshotId, aggregateId, version, timestamp) {
    this.snapshotId = snapshotId;
    this.aggregateId = aggregateId;
    this.version = version;
    this.timestamp = timestamp;
  }
}

export class ProjectionCreatedEvent {
  constructor(projectionId, name, aggregateType, timestamp) {
    this.projectionId = projectionId;
    this.name = name;
    this.aggregateType = aggregateType;
    this.timestamp = timestamp;
  }
}

export class ProjectionUpdatedEvent {
  constructor(projectionId, name, rebuilt, timestamp) {
    this.projectionId = projectionId;
    this.name = name;
    this.rebuilt = rebuilt;
    this.timestamp = timestamp;
  }
}

export class SagaCreatedEvent {
  constructor(sagaId, sagaType, timestamp) {
    this.sagaId = sagaId;
    this.sagaType = sagaType;
    this.timestamp = timestamp;
  }
}

export class SagaStepCompletedEvent {
  constructor(sagaId, step, eventType, timestamp) {
    this.sagaId = sagaId;
    this.step = step;
    this.eventType = eventType;
    this.timestamp = timestamp;
  }
}

export class SagaCompletedEvent {
  constructor(sagaId, timestamp) {
    this.sagaId = sagaId;
    this.timestamp = timestamp;
  }
}

export class SagaFailedEvent {
  constructor(sagaId, reason, timestamp) {
    this.sagaId = sagaId;
    this.reason = reason;
    this.timestamp = timestamp;
  }
}

export class EventsArchivedEvent {
  constructor(aggregateType, count, beforeDate, timestamp) {
    this.aggregateType = aggregateType;
    this.count = count;
    this.beforeDate = beforeDate;
    this.timestamp = timestamp;
  }
}

export class EventValidationPerformedEvent {
  constructor(eventId, valid, errorCount, timestamp) {
    this.eventId = eventId;
    this.valid = valid;
    this.errorCount = errorCount;
    this.timestamp = timestamp;
  }
}

export class EventsTransformedEvent {
  constructor(count, transformationType, timestamp) {
    this.count = count;
    this.transformationType = transformationType;
    this.timestamp = timestamp;
  }
}

export class EventStoreAlertCreatedEvent {
  constructor(alertId, alertType, severity, timestamp) {
    this.alertId = alertId;
    this.alertType = alertType;
    this.severity = severity;
    this.timestamp = timestamp;
  }
}

export class EventStoreSettingsUpdatedEvent {
  constructor(settings, timestamp) {
    this.settings = settings;
    this.timestamp = timestamp;
  }
}

export class EventStoreBackupCreatedEvent {
  constructor(backupId, backupType, timestamp) {
    this.backupId = backupId;
    this.backupType = backupType;
    this.timestamp = timestamp;
  }
}

export class EventStoreRestoredEvent {
  constructor(backupId, timestamp) {
    this.backupId = backupId;
    this.timestamp = timestamp;
  }
}

export class EventStoreDataPurgedEvent {
  constructor(criteria, count, reason, timestamp) {
    this.criteria = criteria;
    this.count = count;
    this.reason = reason;
    this.timestamp = timestamp;
  }
}

export class EventStoreReportGeneratedEvent {
  constructor(reportId, reportType, timestamp) {
    this.reportId = reportId;
    this.reportType = reportType;
    this.timestamp = timestamp;
  }
}