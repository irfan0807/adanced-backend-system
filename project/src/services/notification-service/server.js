import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { NotificationService } from './notification-service.js';
import DatabaseConnectionPool from '../../shared/database/connection-pool.js';
import DualDatabaseWriter from '../../shared/database/dual-writer.js';
import { KafkaService } from '../../shared/messaging/kafka-service.js';
import EventStore from '../../shared/event-sourcing/event-store.js';
import CommandBus from '../../shared/cqrs/command-bus.js';
import QueryBus from '../../shared/cqrs/query-bus.js';
import winston from 'winston';
import nodemailer from 'nodemailer';
import twilio from 'twilio';
import admin from 'firebase-admin';

const app = express();
const PORT = process.env.NOTIFICATION_SERVICE_PORT || 3005;

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/notification-service.log' })
  ]
});

// Initialize dependencies
const connectionPool = new DatabaseConnectionPool();
const kafkaService = new KafkaService();
const dualWriter = new DualDatabaseWriter(connectionPool);
const eventStore = new EventStore(connectionPool, kafkaService);
const commandBus = new CommandBus();
const queryBus = new QueryBus();

// Initialize notification providers
const emailTransporter = nodemailer.createTransporter({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Initialize Firebase Admin SDK for push notifications
if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: process.env.FIREBASE_PROJECT_ID
  });
}

// Initialize services
const notificationService = new NotificationService({
  connectionPool,
  dualWriter,
  eventStore,
  commandBus,
  queryBus,
  kafkaService,
  logger
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));

// Routes
app.post('/notifications', async (req, res) => {
  try {
    const result = await notificationService.createNotification(req.body);
    res.status(201).json({
      success: true,
      data: result.data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error creating notification:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/notifications/:id', async (req, res) => {
  try {
    const notification = await notificationService.getNotification(req.params.id);
    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found',
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: notification,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting notification:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/notifications/user/:userId', async (req, res) => {
  try {
    const { page = 1, limit = 20, type, channel, status } = req.query;
    const result = await notificationService.getNotifications({
      userId: req.params.userId,
      type,
      channel,
      status,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      data: result.notifications,
      pagination: result.pagination,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting user notifications:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.put('/notifications/:id/status', async (req, res) => {
  try {
    const { status, failureReason } = req.body;
    const result = await notificationService.updateNotificationStatus(
      req.params.id,
      status,
      { failureReason }
    );

    res.json({
      success: true,
      data: result.data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error updating notification status:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Bulk notification routes
app.post('/notifications/bulk', async (req, res) => {
  try {
    const result = await notificationService.sendBulkNotification(req.body);
    res.status(201).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error sending bulk notification:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// User preferences routes
app.get('/users/:userId/preferences', async (req, res) => {
  try {
    const preferences = await notificationService.getUserPreferences(req.params.userId);
    res.json({
      success: true,
      data: preferences,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting user preferences:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.put('/users/:userId/preferences', async (req, res) => {
  try {
    const result = await notificationService.updateUserPreferences(
      req.params.userId,
      req.body.preferences
    );
    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error updating user preferences:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Statistics routes
app.get('/notifications/statistics', async (req, res) => {
  try {
    const { userId, type, channel, startDate, endDate, groupBy } = req.query;
    const stats = await notificationService.getNotificationStatistics({
      userId,
      type,
      channel,
      startDate,
      endDate,
      groupBy
    });

    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting notification statistics:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Template routes
app.get('/templates', async (req, res) => {
  try {
    const { page = 1, limit = 20, type, channel, active } = req.query;
    const result = await notificationService.getNotificationTemplates({
      type,
      channel,
      active: active === 'true' ? true : active === 'false' ? false : undefined,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      data: result.templates,
      pagination: result.pagination,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting notification templates:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Failed notifications routes
app.get('/notifications/failed', async (req, res) => {
  try {
    const { page = 1, limit = 20, channel, startDate, endDate, maxRetries = 3 } = req.query;
    const result = await notificationService.getFailedNotifications({
      channel,
      startDate,
      endDate,
      maxRetries: parseInt(maxRetries),
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      data: result.notifications,
      pagination: result.pagination,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting failed notifications:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/notifications/retry', async (req, res) => {
  try {
    const { maxRetries = 3 } = req.body;
    const result = await notificationService.retryFailedNotifications(maxRetries);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error retrying failed notifications:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/notifications/:id/retry', async (req, res) => {
  try {
    await notificationService.retryNotification(req.params.id);
    res.json({
      success: true,
      message: 'Notification retry initiated',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error retrying notification:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'notification-service',
    timestamp: new Date().toISOString(),
    dependencies: {
      database: connectionPool.getStats(),
      dualWriter: dualWriter.getStats(),
      kafka: kafkaService.getStats ? kafkaService.getStats() : 'unknown'
    },
    providers: {
      email: emailTransporter ? 'configured' : 'not configured',
      sms: twilioClient ? 'configured' : 'not configured',
      push: admin.apps.length > 0 ? 'configured' : 'not configured'
    }
  });
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
  res.json({
    service: 'notification-service',
    timestamp: new Date().toISOString(),
    database: connectionPool.getStats(),
    dualWriter: dualWriter.getStats(),
    kafka: kafkaService.getStats ? kafkaService.getStats() : 'unknown'
  });
});

// Notification processing functions
async function processNotification(notification) {
  try {
    logger.info(`Processing notification ${notification.id} via ${notification.channel}`);

    // Send notification based on channel
    switch (notification.channel) {
      case 'email':
        await sendEmail(notification);
        break;
      case 'sms':
        await sendSMS(notification);
        break;
      case 'push':
        await sendPush(notification);
        break;
      default:
        throw new Error(`Unsupported notification channel: ${notification.channel}`);
    }

    // Update status to sent
    await notificationService.updateNotificationStatus(notification.id, 'sent');
  } catch (error) {
    logger.error('Error processing notification:', error);
    await notificationService.updateNotificationStatus(notification.id, 'failed', {
      failureReason: error.message
    });
  }
}

async function sendEmail(notification) {
  try {
    // Get user email from user service or database
    const userEmail = await getUserEmail(notification.userId);
    if (!userEmail) {
      throw new Error('User email not found');
    }

    const mailOptions = {
      from: process.env.SMTP_FROM || 'noreply@yourapp.com',
      to: userEmail,
      subject: notification.subject,
      html: notification.message
    };

    const info = await emailTransporter.sendMail(mailOptions);
    logger.info(`Email sent successfully: ${info.messageId}`);

    return { deliveryId: info.messageId };
  } catch (error) {
    logger.error('Error sending email:', error);
    throw error;
  }
}

async function sendSMS(notification) {
  try {
    // Get user phone from user service or database
    const userPhone = await getUserPhone(notification.userId);
    if (!userPhone) {
      throw new Error('User phone not found');
    }

    const message = await twilioClient.messages.create({
      body: notification.message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: userPhone
    });

    logger.info(`SMS sent successfully: ${message.sid}`);
    return { deliveryId: message.sid };
  } catch (error) {
    logger.error('Error sending SMS:', error);
    throw error;
  }
}

async function sendPush(notification) {
  try {
    // Get user device token from database
    const deviceToken = await getUserDeviceToken(notification.userId);
    if (!deviceToken) {
      throw new Error('User device token not found');
    }

    const message = {
      token: deviceToken,
      notification: {
        title: notification.subject,
        body: notification.message
      },
      data: {
        notificationId: notification.id,
        type: notification.type
      }
    };

    const response = await admin.messaging().send(message);
    logger.info(`Push notification sent successfully: ${response}`);

    return { deliveryId: response };
  } catch (error) {
    logger.error('Error sending push notification:', error);
    throw error;
  }
}

// Helper functions for user data
async function getUserEmail(userId) {
  // In a real implementation, this would call the user service
  // For now, return a mock email or query from database
  try {
    // Try to get from database if stored locally
    const mysqlResult = await connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT email FROM users WHERE id = ?',
        [userId]
      );
      return rows[0];
    });

    return mysqlResult ? mysqlResult.email : `${userId}@example.com`; // Fallback
  } catch (error) {
    logger.warn('Could not get user email, using fallback:', error.message);
    return `${userId}@example.com`;
  }
}

async function getUserPhone(userId) {
  // Similar to getUserEmail
  try {
    const mysqlResult = await connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT phone FROM users WHERE id = ?',
        [userId]
      );
      return rows[0];
    });

    return mysqlResult ? mysqlResult.phone : '+1234567890'; // Fallback
  } catch (error) {
    logger.warn('Could not get user phone, using fallback:', error.message);
    return '+1234567890';
  }
}

async function getUserDeviceToken(userId) {
  // Get device token for push notifications
  try {
    const mysqlResult = await connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT device_token FROM user_devices WHERE user_id = ? AND active = 1',
        [userId]
      );
      return rows[0];
    });

    return mysqlResult ? mysqlResult.device_token : null;
  } catch (error) {
    logger.warn('Could not get user device token:', error.message);
    return null;
  }
}

// Template management functions
async function createNotificationTemplate(templateData) {
  const template = {
    id: require('uuid').v4(),
    ...templateData,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await dualWriter.writeToAllDatabases(template, { tableName: 'notification_templates' });
  return template;
}

async function getNotificationTemplate(templateId) {
  const mysqlResult = await connectionPool.executeWithMySQLConnection(async (connection) => {
    const [rows] = await connection.execute(
      'SELECT * FROM notification_templates WHERE id = ? AND active = 1',
      [templateId]
    );
    return rows[0];
  });

  return mysqlResult;
}

async function renderTemplate(template, data) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return data[key] || match;
  });
}

// Scheduled notification processing
async function processScheduledNotifications() {
  try {
    const now = new Date().toISOString();

    // Get scheduled notifications that are due
    const mysqlResult = await connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT * FROM notifications WHERE status = ? AND scheduled_at <= ?',
        ['scheduled', now]
      );
      return rows;
    });

    for (const notification of mysqlResult) {
      // Update status to pending and process
      await notificationService.updateNotificationStatus(notification.id, 'pending');
      setImmediate(() => processNotification(notification));
    }

    logger.info(`Processed ${mysqlResult.length} scheduled notifications`);
  } catch (error) {
    logger.error('Error processing scheduled notifications:', error);
  }
}

// Start scheduled notification processor
setInterval(processScheduledNotifications, 60000); // Check every minute

// Initialize service
async function initializeService() {
  try {
    await connectionPool.initialize();
    await kafkaService.initialize();
    await notificationService.initialize();

    // Create default notification templates
    await createDefaultTemplates();

    logger.info(`Notification Service started on port ${PORT}`);
  } catch (error) {
    logger.error('Failed to initialize Notification Service:', error);
    process.exit(1);
  }
}

async function createDefaultTemplates() {
  const defaultTemplates = [
    {
      name: 'Transaction Completed',
      type: 'transaction',
      channel: 'email',
      subject: 'Transaction Completed Successfully',
      content: `
        <h2>Transaction Completed</h2>
        <p>Dear {{userName}},</p>
        <p>Your transaction of ${{amount}} {{currency}} has been completed successfully.</p>
        <p>Transaction ID: {{transactionId}}</p>
        <p>Date: {{date}}</p>
        <p>Thank you for using our service!</p>
      `,
      variables: ['userName', 'amount', 'currency', 'transactionId', 'date']
    },
    {
      name: 'Welcome',
      type: 'welcome',
      channel: 'email',
      subject: 'Welcome to Our Platform!',
      content: `
        <h2>Welcome {{userName}}!</h2>
        <p>Thank you for joining our platform.</p>
        <p>Your account has been created successfully.</p>
        <p>Date: {{date}}</p>
        <p>If you have any questions, please don't hesitate to contact our support team.</p>
      `,
      variables: ['userName', 'date']
    }
  ];

  for (const template of defaultTemplates) {
    try {
      await createNotificationTemplate(template);
    } catch (error) {
      // Template might already exist, ignore
      logger.debug('Template creation skipped:', template.name);
    }
  }
}

app.listen(PORT, () => {
  initializeService();
});

export default app;