export class CreateNotificationCommand {
  constructor(data) {
    this.id = data.id;
    this.userId = data.userId;
    this.type = data.type; // email, sms, push, in_app
    this.channel = data.channel; // email, sms, push
    this.subject = data.subject;
    this.message = data.message;
    this.templateId = data.templateId;
    this.templateData = data.templateData || {};
    this.priority = data.priority || 'normal'; // low, normal, high, urgent
    this.scheduledAt = data.scheduledAt;
    this.metadata = data.metadata || {};
    this.createdAt = data.createdAt;
  }

  validate() {
    const errors = [];

    if (!this.id) errors.push('Notification ID is required');
    if (!this.userId) errors.push('User ID is required');
    if (!this.type) errors.push('Notification type is required');
    if (!this.channel) errors.push('Notification channel is required');
    if (!this.message && !this.templateId) errors.push('Message or template ID is required');

    const validTypes = ['email', 'sms', 'push', 'in_app'];
    const validChannels = ['email', 'sms', 'push'];
    const validPriorities = ['low', 'normal', 'high', 'urgent'];

    if (!validTypes.includes(this.type)) errors.push('Invalid notification type');
    if (!validChannels.includes(this.channel)) errors.push('Invalid notification channel');
    if (!validPriorities.includes(this.priority)) errors.push('Invalid priority level');

    if (this.scheduledAt && new Date(this.scheduledAt) <= new Date()) {
      errors.push('Scheduled time must be in the future');
    }

    if (errors.length > 0) {
      throw new Error(`Validation errors: ${errors.join(', ')}`);
    }
  }
}

export class UpdateNotificationStatusCommand {
  constructor(data) {
    this.notificationId = data.notificationId;
    this.status = data.status;
    this.failureReason = data.failureReason;
    this.retryCount = data.retryCount || 0;
    this.updatedAt = data.updatedAt;
    this.metadata = data.metadata || {};
  }

  validate() {
    const errors = [];
    const validStatuses = ['pending', 'processing', 'sent', 'delivered', 'failed', 'cancelled'];

    if (!this.notificationId) errors.push('Notification ID is required');
    if (!this.status) errors.push('Status is required');
    if (!validStatuses.includes(this.status)) errors.push('Invalid status');

    if (this.status === 'failed' && !this.failureReason) {
      errors.push('Failure reason is required when status is failed');
    }

    if (errors.length > 0) {
      throw new Error(`Validation errors: ${errors.join(', ')}`);
    }
  }
}

export class SendBulkNotificationCommand {
  constructor(data) {
    this.id = data.id;
    this.userIds = data.userIds; // Array of user IDs
    this.type = data.type;
    this.channel = data.channel;
    this.subject = data.subject;
    this.message = data.message;
    this.templateId = data.templateId;
    this.templateData = data.templateData || {};
    this.priority = data.priority || 'normal';
    this.scheduledAt = data.scheduledAt;
    this.metadata = data.metadata || {};
    this.createdAt = data.createdAt;
  }

  validate() {
    const errors = [];

    if (!this.id) errors.push('Bulk notification ID is required');
    if (!Array.isArray(this.userIds) || this.userIds.length === 0) {
      errors.push('User IDs array is required and cannot be empty');
    }
    if (!this.type) errors.push('Notification type is required');
    if (!this.channel) errors.push('Notification channel is required');
    if (!this.message && !this.templateId) errors.push('Message or template ID is required');

    const validTypes = ['email', 'sms', 'push', 'in_app'];
    const validChannels = ['email', 'sms', 'push'];
    const validPriorities = ['low', 'normal', 'high', 'urgent'];

    if (!validTypes.includes(this.type)) errors.push('Invalid notification type');
    if (!validChannels.includes(this.channel)) errors.push('Invalid notification channel');
    if (!validPriorities.includes(this.priority)) errors.push('Invalid priority level');

    if (this.scheduledAt && new Date(this.scheduledAt) <= new Date()) {
      errors.push('Scheduled time must be in the future');
    }

    if (errors.length > 0) {
      throw new Error(`Validation errors: ${errors.join(', ')}`);
    }
  }
}

export class UpdateUserNotificationPreferencesCommand {
  constructor(data) {
    this.userId = data.userId;
    this.preferences = data.preferences; // { email: true, sms: false, push: true, etc. }
    this.updatedAt = data.updatedAt;
  }

  validate() {
    const errors = [];

    if (!this.userId) errors.push('User ID is required');
    if (!this.preferences || typeof this.preferences !== 'object') {
      errors.push('Preferences object is required');
    }

    const validChannels = ['email', 'sms', 'push', 'in_app'];
    for (const channel of Object.keys(this.preferences)) {
      if (!validChannels.includes(channel)) {
        errors.push(`Invalid channel: ${channel}`);
      }
      if (typeof this.preferences[channel] !== 'boolean') {
        errors.push(`Preference for ${channel} must be boolean`);
      }
    }

    if (errors.length > 0) {
      throw new Error(`Validation errors: ${errors.join(', ')}`);
    }
  }
}