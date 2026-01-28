// Event Store Commands
export class StoreEventCommand {
  constructor(aggregateId, aggregateType, eventType, eventData, metadata = {}) {
    this.aggregateId = aggregateId;
    this.aggregateType = aggregateType;
    this.eventType = eventType;
    this.eventData = eventData;
    this.metadata = metadata;
  }
}

export class StoreEventsBatchCommand {
  constructor(events) {
    this.events = events;
  }
}

export class ReplayEventsCommand {
  constructor(aggregateId, fromVersion, toVersion) {
    this.aggregateId = aggregateId;
    this.fromVersion = fromVersion;
    this.toVersion = toVersion;
  }
}

export class CreateSnapshotCommand {
  constructor(aggregateId, state, version) {
    this.aggregateId = aggregateId;
    this.state = state;
    this.version = version;
  }
}

export class CreateProjectionCommand {
  constructor(name, aggregateType, eventTypes, initialState = {}) {
    this.name = name;
    this.aggregateType = aggregateType;
    this.eventTypes = eventTypes;
    this.initialState = initialState;
  }
}

export class UpdateProjectionCommand {
  constructor(name, rebuild = false) {
    this.name = name;
    this.rebuild = rebuild;
  }
}

export class CreateSagaCommand {
  constructor(sagaType, initiatingEvent, steps) {
    this.sagaType = sagaType;
    this.initiatingEvent = initiatingEvent;
    this.steps = steps;
  }
}

export class ProcessSagaEventCommand {
  constructor(sagaId, eventType, eventData) {
    this.sagaId = sagaId;
    this.eventType = eventType;
    this.eventData = eventData;
  }
}

export class ArchiveEventsCommand {
  constructor(aggregateType, beforeDate, archivePath) {
    this.aggregateType = aggregateType;
    this.beforeDate = beforeDate;
    this.archivePath = archivePath;
  }
}

export class ValidateEventCommand {
  constructor(event) {
    this.event = event;
  }
}

export class TransformEventsCommand {
  constructor(events, transformation) {
    this.events = events;
    this.transformation = transformation;
  }
}

export class CreateEventStoreAlertCommand {
  constructor(alertType, message, severity, metadata = {}) {
    this.alertType = alertType;
    this.message = message;
    this.severity = severity;
    this.metadata = metadata;
  }
}

export class UpdateEventStoreSettingsCommand {
  constructor(settings) {
    this.settings = settings;
  }
}

export class CreateEventStoreBackupCommand {
  constructor(backupType, options = {}) {
    this.backupType = backupType;
    this.options = options;
  }
}

export class RestoreEventStoreCommand {
  constructor(backupId, options = {}) {
    this.backupId = backupId;
    this.options = options;
  }
}

export class PurgeEventStoreDataCommand {
  constructor(criteria, reason) {
    this.criteria = criteria;
    this.reason = reason;
  }
}

export class CreateEventStoreReportCommand {
  constructor(reportType, parameters = {}) {
    this.reportType = reportType;
    this.parameters = parameters;
  }
}