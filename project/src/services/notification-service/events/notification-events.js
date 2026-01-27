export class NotificationCreatedEvent {
  constructor(data) {
    this.eventType = 'NotificationCreated';
    this.aggregateId = data.notificationId;
    this.notificationId = data.notificationId;
    this.userId = data.userId;
    this.type = data.type;
    this.channel = data.channel;
    this.priority = data.priority;
    this.scheduledAt = data.scheduledAt;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp;
    this.version = 1;
  }
}

export class NotificationSentEvent {
  constructor(data) {
    this.eventType = 'NotificationSent';
    this.aggregateId = data.notificationId;
    this.notificationId = data.notificationId;
    this.userId = data.userId;
    this.channel = data.channel;
    this.sentAt = data.sentAt;
    this.deliveryId = data.deliveryId; // Provider's delivery ID
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp;
    this.version = 1;
  }
}

export class NotificationDeliveredEvent {
  constructor(data) {
    this.eventType = 'NotificationDelivered';
    this.aggregateId = data.notificationId;
    this.notificationId = data.notificationId;
    this.userId = data.userId;
    this.channel = data.channel;
    this.deliveredAt = data.deliveredAt;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp;
    this.version = 1;
  }
}

export class NotificationFailedEvent {
  constructor(data) {
    this.eventType = 'NotificationFailed';
    this.aggregateId = data.notificationId;
    this.notificationId = data.notificationId;
    this.userId = data.userId;
    this.channel = data.channel;
    this.failureReason = data.failureReason;
    this.retryCount = data.retryCount;
    this.nextRetryAt = data.nextRetryAt;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp;
    this.version = 1;
  }
}

export class NotificationStatusUpdatedEvent {
  constructor(data) {
    this.eventType = 'NotificationStatusUpdated';
    this.aggregateId = data.notificationId;
    this.notificationId = data.notificationId;
    this.oldStatus = data.oldStatus;
    this.newStatus = data.newStatus;
    this.reason = data.reason;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp;
    this.version = 1;
  }
}

export class BulkNotificationCreatedEvent {
  constructor(data) {
    this.eventType = 'BulkNotificationCreated';
    this.aggregateId = data.bulkNotificationId;
    this.bulkNotificationId = data.bulkNotificationId;
    this.userIds = data.userIds;
    this.type = data.type;
    this.channel = data.channel;
    this.totalCount = data.totalCount;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp;
    this.version = 1;
  }
}

export class UserNotificationPreferencesUpdatedEvent {
  constructor(data) {
    this.eventType = 'UserNotificationPreferencesUpdated';
    this.aggregateId = data.userId;
    this.userId = data.userId;
    this.preferences = data.preferences;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp;
    this.version = 1;
  }
}

export class NotificationTemplateCreatedEvent {
  constructor(data) {
    this.eventType = 'NotificationTemplateCreated';
    this.aggregateId = data.templateId;
    this.templateId = data.templateId;
    this.name = data.name;
    this.type = data.type;
    this.channel = data.channel;
    this.subject = data.subject;
    this.content = data.content;
    this.variables = data.variables || [];
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp;
    this.version = 1;
  }
}