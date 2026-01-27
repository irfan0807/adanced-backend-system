import { v4 as uuidv4 } from 'uuid';
import {
  CreateNotificationCommand,
  UpdateNotificationStatusCommand,
  SendBulkNotificationCommand,
  UpdateUserNotificationPreferencesCommand
} from '../commands/notification-commands.js';
import {
  NotificationCreatedEvent,
  NotificationSentEvent,
  NotificationFailedEvent,
  NotificationStatusUpdatedEvent,
  BulkNotificationCreatedEvent,
  UserNotificationPreferencesUpdatedEvent
} from '../events/notification-events.js';
import RetryWithBackoff from '../../../shared/patterns/retry-with-backoff.js';

export class NotificationCommandHandler {
  constructor(dependencies) {
    this.connectionPool = dependencies.connectionPool;
    this.dualWriter = dependencies.dualWriter;
    this.eventStore = dependencies.eventStore;
    this.kafkaService = dependencies.kafkaService;
    this.logger = dependencies.logger;

    this.retryLogic = new RetryWithBackoff({
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000
    });
  }

  async handle(command) {
    if (command instanceof CreateNotificationCommand) {
      return await this.handleCreateNotification(command);
    } else if (command instanceof UpdateNotificationStatusCommand) {
      return await this.handleUpdateNotificationStatus(command);
    } else if (command instanceof SendBulkNotificationCommand) {
      return await this.handleSendBulkNotification(command);
    } else if (command instanceof UpdateUserNotificationPreferencesCommand) {
      return await this.handleUpdateUserPreferences(command);
    } else {
      throw new Error(`Unknown command type: ${command.constructor.name}`);
    }
  }

  async handleCreateNotification(command) {
    try {
      command.validate();

      // Check user preferences
      const userPrefs = await this.getUserNotificationPreferences(command.userId);
      if (userPrefs && userPrefs[command.channel] === false) {
        throw new Error(`User has disabled ${command.channel} notifications`);
      }

      // Process template if provided
      let finalSubject = command.subject;
      let finalMessage = command.message;

      if (command.templateId) {
        const template = await this.getNotificationTemplate(command.templateId);
        if (!template) {
          throw new Error('Notification template not found');
        }

        finalSubject = this.renderTemplate(template.subject, command.templateData);
        finalMessage = this.renderTemplate(template.content, command.templateData);
      }

      const notificationData = {
        id: command.id,
        userId: command.userId,
        type: command.type,
        channel: command.channel,
        subject: finalSubject,
        message: finalMessage,
        templateId: command.templateId,
        priority: command.priority,
        status: command.scheduledAt ? 'scheduled' : 'pending',
        scheduledAt: command.scheduledAt,
        retryCount: 0,
        metadata: command.metadata,
        createdAt: command.createdAt || new Date().toISOString(),
        updatedAt: command.createdAt || new Date().toISOString()
      };

      // Write to databases
      await this.dualWriter.writeToAllDatabases(notificationData);

      // Store event
      const event = new NotificationCreatedEvent({
        notificationId: command.id,
        userId: command.userId,
        type: command.type,
        channel: command.channel,
        priority: command.priority,
        scheduledAt: command.scheduledAt,
        timestamp: new Date().toISOString()
      });

      await this.eventStore.append(event);

      // Publish event
      await this.kafkaService.produce('notification-events', {
        key: command.id,
        value: JSON.stringify(event)
      });

      // Process immediately if not scheduled
      if (!command.scheduledAt) {
        setImmediate(() => this.processNotificationAsync(notificationData));
      }

      this.logger.info('Notification created successfully', {
        notificationId: command.id,
        userId: command.userId,
        channel: command.channel
      });

      return {
        success: true,
        notificationId: command.id,
        data: notificationData
      };

    } catch (error) {
      this.logger.error('Failed to create notification', {
        notificationId: command.id,
        error: error.message
      });
      throw error;
    }
  }

  async handleUpdateNotificationStatus(command) {
    try {
      command.validate();

      const notification = await this.getNotificationById(command.notificationId);
      if (!notification) {
        throw new Error('Notification not found');
      }

      const updatedData = {
        ...notification,
        status: command.status,
        retryCount: command.retryCount,
        failureReason: command.failureReason,
        sentAt: command.status === 'sent' ? new Date().toISOString() : notification.sentAt,
        updatedAt: command.updatedAt || new Date().toISOString()
      };

      // Update databases
      await this.dualWriter.writeToAllDatabases(updatedData);

      // Store event
      const event = new NotificationStatusUpdatedEvent({
        notificationId: command.notificationId,
        oldStatus: notification.status,
        newStatus: command.status,
        reason: command.failureReason,
        timestamp: new Date().toISOString()
      });

      await this.eventStore.append(event);

      // Publish event
      await this.kafkaService.produce('notification-events', {
        key: command.notificationId,
        value: JSON.stringify(event)
      });

      this.logger.info('Notification status updated', {
        notificationId: command.notificationId,
        oldStatus: notification.status,
        newStatus: command.status
      });

      return {
        success: true,
        notificationId: command.notificationId,
        data: updatedData
      };

    } catch (error) {
      this.logger.error('Failed to update notification status', {
        notificationId: command.notificationId,
        error: error.message
      });
      throw error;
    }
  }

  async handleSendBulkNotification(command) {
    try {
      command.validate();

      const bulkNotificationId = command.id;
      const individualNotifications = [];

      // Create individual notifications for each user
      for (const userId of command.userIds) {
        const individualCommand = new CreateNotificationCommand({
          id: uuidv4(),
          userId: userId,
          type: command.type,
          channel: command.channel,
          subject: command.subject,
          message: command.message,
          templateId: command.templateId,
          templateData: command.templateData,
          priority: command.priority,
          scheduledAt: command.scheduledAt,
          metadata: {
            ...command.metadata,
            bulkNotificationId: bulkNotificationId
          },
          createdAt: command.createdAt
        });

        try {
          const result = await this.handleCreateNotification(individualCommand);
          individualNotifications.push(result);
        } catch (error) {
          this.logger.warn('Failed to create notification for user', {
            userId,
            bulkNotificationId,
            error: error.message
          });
        }
      }

      // Store bulk notification event
      const event = new BulkNotificationCreatedEvent({
        bulkNotificationId: bulkNotificationId,
        userIds: command.userIds,
        type: command.type,
        channel: command.channel,
        totalCount: command.userIds.length,
        timestamp: new Date().toISOString()
      });

      await this.eventStore.append(event);

      await this.kafkaService.produce('notification-events', {
        key: bulkNotificationId,
        value: JSON.stringify(event)
      });

      this.logger.info('Bulk notification created', {
        bulkNotificationId,
        totalUsers: command.userIds.length,
        successful: individualNotifications.length
      });

      return {
        success: true,
        bulkNotificationId,
        totalRequested: command.userIds.length,
        successful: individualNotifications.length,
        notifications: individualNotifications
      };

    } catch (error) {
      this.logger.error('Failed to send bulk notification', {
        bulkNotificationId: command.id,
        error: error.message
      });
      throw error;
    }
  }

  async handleUpdateUserPreferences(command) {
    try {
      command.validate();

      const preferencesData = {
        userId: command.userId,
        preferences: command.preferences,
        updatedAt: command.updatedAt || new Date().toISOString()
      };

      // Write to databases
      await this.dualWriter.writeToAllDatabases(preferencesData, { tableName: 'user_notification_preferences' });

      // Store event
      const event = new UserNotificationPreferencesUpdatedEvent({
        userId: command.userId,
        preferences: command.preferences,
        timestamp: new Date().toISOString()
      });

      await this.eventStore.append(event);

      await this.kafkaService.produce('notification-events', {
        key: command.userId,
        value: JSON.stringify(event)
      });

      this.logger.info('User notification preferences updated', {
        userId: command.userId,
        preferences: command.preferences
      });

      return {
        success: true,
        userId: command.userId,
        preferences: command.preferences
      };

    } catch (error) {
      this.logger.error('Failed to update user preferences', {
        userId: command.userId,
        error: error.message
      });
      throw error;
    }
  }

  // Helper methods
  async getNotificationById(notificationId) {
    // Implementation similar to existing getNotificationById
    const mysqlResult = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT * FROM notifications WHERE id = ?',
        [notificationId]
      );
      return rows[0];
    });

    if (mysqlResult) return mysqlResult;

    const mongoDB = this.connectionPool.getMongoDatabase();
    return await mongoDB.collection('notifications').findOne({ id: notificationId });
  }

  async getUserNotificationPreferences(userId) {
    try {
      const mysqlResult = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute(
          'SELECT * FROM user_notification_preferences WHERE user_id = ?',
          [userId]
        );
        return rows[0];
      });

      if (mysqlResult) return mysqlResult.preferences;

      const mongoDB = this.connectionPool.getMongoDatabase();
      const mongoResult = await mongoDB.collection('user_notification_preferences').findOne({ userId });
      return mongoResult ? mongoResult.preferences : null;
    } catch (error) {
      this.logger.warn('Error getting user preferences, using defaults', { userId, error: error.message });
      return { email: true, sms: true, push: true, in_app: true }; // Default preferences
    }
  }

  async getNotificationTemplate(templateId) {
    const mysqlResult = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT * FROM notification_templates WHERE id = ? AND active = 1',
        [templateId]
      );
      return rows[0];
    });

    if (mysqlResult) return mysqlResult;

    const mongoDB = this.connectionPool.getMongoDatabase();
    return await mongoDB.collection('notification_templates').findOne({ id: templateId, active: true });
  }

  renderTemplate(template, data) {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return data[key] || match;
    });
  }

  async processNotificationAsync(notification) {
    try {
      await this.processNotification(notification);
    } catch (error) {
      this.logger.error('Async notification processing failed', {
        notificationId: notification.id,
        error: error.message
      });
    }
  }

  async processNotification(notification) {
    // Implementation will be updated in server.js
    // This is a placeholder for the actual processing logic
  }
}