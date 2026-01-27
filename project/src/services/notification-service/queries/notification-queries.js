export class GetNotificationQuery {
  constructor(data) {
    this.notificationId = data.notificationId;
  }

  validate() {
    if (!this.notificationId) {
      throw new Error('Notification ID is required');
    }
  }
}

export class GetNotificationsQuery {
  constructor(data) {
    this.userId = data.userId;
    this.type = data.type;
    this.channel = data.channel;
    this.status = data.status;
    this.priority = data.priority;
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.page = data.page || 1;
    this.limit = data.limit || 20;
    this.sortBy = data.sortBy || 'createdAt';
    this.sortOrder = data.sortOrder || 'desc';
  }

  validate() {
    const validSortFields = ['createdAt', 'sentAt', 'updatedAt', 'priority'];
    const validSortOrders = ['asc', 'desc'];

    if (this.page < 1) {
      throw new Error('Page must be greater than 0');
    }
    if (this.limit < 1 || this.limit > 100) {
      throw new Error('Limit must be between 1 and 100');
    }
    if (!validSortFields.includes(this.sortBy)) {
      throw new Error(`Invalid sort field: ${this.sortBy}`);
    }
    if (!validSortOrders.includes(this.sortOrder)) {
      throw new Error(`Invalid sort order: ${this.sortOrder}`);
    }
  }
}

export class GetNotificationStatisticsQuery {
  constructor(data) {
    this.userId = data.userId;
    this.type = data.type;
    this.channel = data.channel;
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.groupBy = data.groupBy || 'day'; // day, week, month
  }

  validate() {
    const validGroupBy = ['day', 'week', 'month', 'channel', 'type'];

    if (!validGroupBy.includes(this.groupBy)) {
      throw new Error(`Invalid group by: ${this.groupBy}`);
    }
  }
}

export class GetUserNotificationPreferencesQuery {
  constructor(data) {
    this.userId = data.userId;
  }

  validate() {
    if (!this.userId) {
      throw new Error('User ID is required');
    }
  }
}

export class GetNotificationTemplatesQuery {
  constructor(data) {
    this.type = data.type;
    this.channel = data.channel;
    this.active = data.active; // true, false, or undefined for all
    this.page = data.page || 1;
    this.limit = data.limit || 20;
  }

  validate() {
    if (this.page < 1) {
      throw new Error('Page must be greater than 0');
    }
    if (this.limit < 1 || this.limit > 100) {
      throw new Error('Limit must be between 1 and 100');
    }
  }
}

export class GetFailedNotificationsQuery {
  constructor(data) {
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.channel = data.channel;
    this.maxRetries = data.maxRetries || 3;
    this.page = data.page || 1;
    this.limit = data.limit || 20;
  }

  validate() {
    if (this.page < 1) {
      throw new Error('Page must be greater than 0');
    }
    if (this.limit < 1 || this.limit > 100) {
      throw new Error('Limit must be between 1 and 100');
    }
  }
}