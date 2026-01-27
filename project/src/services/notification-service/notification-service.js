import { v4 as uuidv4 } from 'uuid';
import { NotificationCommandHandler } from './handlers/notification-command-handler.js';
import { NotificationQueryHandler } from './handlers/notification-query-handler.js';
import {
  CreateNotificationCommand,
  UpdateNotificationStatusCommand,
  SendBulkNotificationCommand,
  UpdateUserNotificationPreferencesCommand
} from './commands/notification-commands.js';
import {
  GetNotificationQuery,
  GetNotificationsQuery,
  GetNotificationStatisticsQuery,
  GetUserNotificationPreferencesQuery,
  GetNotificationTemplatesQuery,
  GetFailedNotificationsQuery
} from './queries/notification-queries.js';
import { KafkaService } from '../../shared/messaging/kafka-service.js';
import EventStore from '../../shared/event-sourcing/event-store.js';
import CommandBus from '../../shared/cqrs/command-bus.js';
import QueryBus from '../../shared/cqrs/query-bus.js';

export class NotificationService {
  constructor(dependencies) {
    this.connectionPool = dependencies.connectionPool;
    this.dualWriter = dependencies.dualWriter;
    this.eventStore = dependencies.eventStore || new EventStore(dependencies.connectionPool, dependencies.kafkaService);
    this.commandBus = dependencies.commandBus || new CommandBus();
    this.queryBus = dependencies.queryBus || new QueryBus();
    this.kafkaService = dependencies.kafkaService || new KafkaService();
    this.logger = dependencies.logger;

    this.commandHandler = new NotificationCommandHandler({
      connectionPool: this.connectionPool,
      dualWriter: this.dualWriter,
      eventStore: this.eventStore,
      kafkaService: this.kafkaService,
      logger: this.logger
    });

    this.queryHandler = new NotificationQueryHandler({
      connectionPool: this.connectionPool,
      logger: this.logger
    });
  }

  async initialize() {
    // Register command handlers
    this.commandBus.registerHandler('CreateNotificationCommand', this.commandHandler);
    this.commandBus.registerHandler('UpdateNotificationStatusCommand', this.commandHandler);
    this.commandBus.registerHandler('SendBulkNotificationCommand', this.commandHandler);
    this.commandBus.registerHandler('UpdateUserNotificationPreferencesCommand', this.commandHandler);

    // Register query handlers
    this.queryBus.registerHandler('GetNotificationQuery', this.queryHandler);
    this.queryBus.registerHandler('GetNotificationsQuery', this.queryHandler);
    this.queryBus.registerHandler('GetNotificationStatisticsQuery', this.queryHandler);
    this.queryBus.registerHandler('GetUserNotificationPreferencesQuery', this.queryHandler);
    this.queryBus.registerHandler('GetNotificationTemplatesQuery', this.queryHandler);
    this.queryBus.registerHandler('GetFailedNotificationsQuery', this.queryHandler);

    // Setup event handlers for external events
    await this.setupEventHandlers();

    this.logger.info('Notification Service initialized');
  }

  async createNotification(notificationData) {
    const command = new CreateNotificationCommand({
      id: uuidv4(),
      ...notificationData,
      createdAt: new Date().toISOString()
    });

    return await this.commandBus.execute(command);
  }

  async updateNotificationStatus(notificationId, status, options = {}) {
    const command = new UpdateNotificationStatusCommand({
      notificationId,
      status,
      failureReason: options.failureReason,
      retryCount: options.retryCount,
      updatedAt: new Date().toISOString()
    });

    return await this.commandBus.execute(command);
  }

  async sendBulkNotification(bulkData) {
    const command = new SendBulkNotificationCommand({
      id: uuidv4(),
      ...bulkData,
      createdAt: new Date().toISOString()
    });

    return await this.commandBus.execute(command);
  }

  async updateUserPreferences(userId, preferences) {
    const command = new UpdateUserNotificationPreferencesCommand({
      userId,
      preferences,
      updatedAt: new Date().toISOString()
    });

    return await this.commandBus.execute(command);
  }

  async getNotification(notificationId) {
    const query = new GetNotificationQuery({ notificationId });
    return await this.queryBus.execute(query);
  }

  async getNotifications(criteria = {}) {
    const query = new GetNotificationsQuery(criteria);
    return await this.queryBus.execute(query);
  }

  async getNotificationStatistics(criteria = {}) {
    const query = new GetNotificationStatisticsQuery(criteria);
    return await this.queryBus.execute(query);
  }

  async getUserPreferences(userId) {
    const query = new GetUserNotificationPreferencesQuery({ userId });
    return await this.queryBus.execute(query);
  }

  async getNotificationTemplates(criteria = {}) {
    const query = new GetNotificationTemplatesQuery(criteria);
    return await this.queryBus.execute(query);
  }

  async getFailedNotifications(criteria = {}) {
    const query = new GetFailedNotificationsQuery(criteria);
    return await this.queryBus.execute(query);
  }

  async retryFailedNotifications(maxRetries = 3) {
    const failedNotifications = await this.getFailedNotifications({ maxRetries });

    const results = [];
    for (const notification of failedNotifications.notifications) {
      try {
        await this.retryNotification(notification.id);
        results.push({ id: notification.id, success: true });
      } catch (error) {
        results.push({ id: notification.id, success: false, error: error.message });
      }
    }

    return {
      total: failedNotifications.notifications.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    };
  }

  async retryNotification(notificationId) {
    const notification = await this.getNotification(notificationId);
    if (!notification) {
      throw new Error('Notification not found');
    }

    if (notification.status !== 'failed') {
      throw new Error('Notification is not in failed state');
    }

    // Reset status to pending and increment retry count
    await this.updateNotificationStatus(notificationId, 'pending', {
      retryCount: (notification.retryCount || 0) + 1
    });

    // Re-process the notification
    setImmediate(() => this.processNotificationAsync(notification));
  }

  async setupEventHandlers() {
    // Listen for events from other services that might trigger notifications
    const eventTopics = [
      'transaction-events',
      'user-events',
      'payment-events',
      'account-events'
    ];

    for (const topic of eventTopics) {
      await this.kafkaService.consumeMessages(
        [topic],
        `notification-service-${topic.replace('-events', '')}`,
        async (message) => {
          try {
            const event = JSON.parse(message.value);
            await this.handleExternalEvent(event);
          } catch (error) {
            this.logger.error('Error handling external event:', error);
          }
        }
      );
    }
  }

  async handleExternalEvent(event) {
    // Handle events from other services and create notifications accordingly
    switch (event.eventType) {
      case 'TransactionCompleted':
        await this.createTransactionCompletionNotification(event);
        break;
      case 'TransactionFailed':
        await this.createTransactionFailureNotification(event);
        break;
      case 'PaymentReceived':
        await this.createPaymentReceivedNotification(event);
        break;
      case 'AccountCreated':
        await this.createWelcomeNotification(event);
        break;
      case 'UserRegistered':
        await this.createWelcomeNotification(event);
        break;
      case 'PasswordChanged':
        await this.createSecurityNotification(event);
        break;
      default:
        // Log unknown events for monitoring
        this.logger.debug('Received unknown event type:', event.eventType);
    }
  }

  async createTransactionCompletionNotification(event) {
    const notificationData = {
      userId: event.eventData.userId,
      type: 'transaction',
      channel: 'email', // Could be determined by user preferences
      subject: 'Transaction Completed',
      message: `Your transaction of $${event.eventData.amount} has been completed successfully.`,
      templateId: 'transaction-completed',
      templateData: {
        amount: event.eventData.amount,
        currency: event.eventData.currency,
        transactionId: event.aggregateId,
        date: new Date().toLocaleDateString()
      },
      priority: 'normal',
      metadata: {
        transactionId: event.aggregateId,
        eventId: event.id
      }
    };

    await this.createNotification(notificationData);
  }

  async createTransactionFailureNotification(event) {
    const notificationData = {
      userId: event.eventData.userId,
      type: 'transaction',
      channel: 'email',
      subject: 'Transaction Failed',
      message: `Your transaction failed. Reason: ${event.eventData.reason || 'Unknown'}`,
      templateId: 'transaction-failed',
      templateData: {
        transactionId: event.aggregateId,
        reason: event.eventData.reason,
        date: new Date().toLocaleDateString()
      },
      priority: 'high',
      metadata: {
        transactionId: event.aggregateId,
        eventId: event.id
      }
    };

    await this.createNotification(notificationData);
  }

  async createPaymentReceivedNotification(event) {
    const notificationData = {
      userId: event.eventData.recipientId,
      type: 'payment',
      channel: 'push',
      subject: 'Payment Received',
      message: `You received $${event.eventData.amount} from ${event.eventData.senderName || 'someone'}.`,
      templateId: 'payment-received',
      templateData: {
        amount: event.eventData.amount,
        sender: event.eventData.senderName,
        date: new Date().toLocaleDateString()
      },
      priority: 'normal',
      metadata: {
        paymentId: event.aggregateId,
        eventId: event.id
      }
    };

    await this.createNotification(notificationData);
  }

  async createWelcomeNotification(event) {
    const notificationData = {
      userId: event.aggregateId,
      type: 'welcome',
      channel: 'email',
      subject: 'Welcome to Our Platform!',
      message: 'Welcome! Your account has been created successfully.',
      templateId: 'welcome',
      templateData: {
        userName: event.eventData.name || event.eventData.email,
        date: new Date().toLocaleDateString()
      },
      priority: 'normal',
      metadata: {
        eventId: event.id
      }
    };

    await this.createNotification(notificationData);
  }

  async createSecurityNotification(event) {
    const notificationData = {
      userId: event.aggregateId,
      type: 'security',
      channel: 'email',
      subject: 'Security Alert',
      message: 'Your password has been changed. If this wasn\'t you, please contact support immediately.',
      templateId: 'security-alert',
      templateData: {
        action: 'Password Changed',
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString()
      },
      priority: 'urgent',
      metadata: {
        eventId: event.id
      }
    };

    await this.createNotification(notificationData);
  }

  // Placeholder methods to be implemented in server.js
  async processNotificationAsync(notification) {
    // This will be implemented in the server.js file
  }

  async processNotification(notification) {
    // This will be implemented in the server.js file
  }
}