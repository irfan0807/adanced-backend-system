import {
  GetNotificationQuery,
  GetNotificationsQuery,
  GetNotificationStatisticsQuery,
  GetUserNotificationPreferencesQuery,
  GetNotificationTemplatesQuery,
  GetFailedNotificationsQuery
} from '../queries/notification-queries.js';

export class NotificationQueryHandler {
  constructor(dependencies) {
    this.connectionPool = dependencies.connectionPool;
    this.logger = dependencies.logger;
  }

  async handle(query) {
    if (query instanceof GetNotificationQuery) {
      return await this.handleGetNotification(query);
    } else if (query instanceof GetNotificationsQuery) {
      return await this.handleGetNotifications(query);
    } else if (query instanceof GetNotificationStatisticsQuery) {
      return await this.handleGetNotificationStatistics(query);
    } else if (query instanceof GetUserNotificationPreferencesQuery) {
      return await this.handleGetUserPreferences(query);
    } else if (query instanceof GetNotificationTemplatesQuery) {
      return await this.handleGetNotificationTemplates(query);
    } else if (query instanceof GetFailedNotificationsQuery) {
      return await this.handleGetFailedNotifications(query);
    } else {
      throw new Error(`Unknown query type: ${query.constructor.name}`);
    }
  }

  async handleGetNotification(query) {
    try {
      query.validate();

      // Try MySQL first
      const mysqlResult = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute(
          'SELECT * FROM notifications WHERE id = ?',
          [query.notificationId]
        );
        return rows[0];
      });

      if (mysqlResult) {
        return this.formatNotification(mysqlResult);
      }

      // Fallback to MongoDB
      const mongoDB = this.connectionPool.getMongoDatabase();
      const mongoResult = await mongoDB.collection('notifications').findOne({
        id: query.notificationId
      });

      return mongoResult ? this.formatNotification(mongoResult) : null;

    } catch (error) {
      this.logger.error('Error getting notification', {
        notificationId: query.notificationId,
        error: error.message
      });
      throw error;
    }
  }

  async handleGetNotifications(query) {
    try {
      query.validate();

      const { page, limit, sortBy, sortOrder } = query;
      const offset = (page - 1) * limit;

      // Build WHERE clause
      let whereConditions = [];
      let params = [];

      if (query.userId) {
        whereConditions.push('user_id = ?');
        params.push(query.userId);
      }
      if (query.type) {
        whereConditions.push('type = ?');
        params.push(query.type);
      }
      if (query.channel) {
        whereConditions.push('channel = ?');
        params.push(query.channel);
      }
      if (query.status) {
        whereConditions.push('status = ?');
        params.push(query.status);
      }
      if (query.priority) {
        whereConditions.push('priority = ?');
        params.push(query.priority);
      }
      if (query.startDate) {
        whereConditions.push('created_at >= ?');
        params.push(query.startDate);
      }
      if (query.endDate) {
        whereConditions.push('created_at <= ?');
        params.push(query.endDate);
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
      const orderClause = `ORDER BY ${this.mapSortField(sortBy)} ${sortOrder.toUpperCase()}`;

      // Try MySQL first
      const mysqlResult = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute(
          `SELECT * FROM notifications ${whereClause} ${orderClause} LIMIT ? OFFSET ?`,
          [...params, limit, offset]
        );

        const [countRows] = await connection.execute(
          `SELECT COUNT(*) as total FROM notifications ${whereClause}`,
          params
        );

        return {
          notifications: rows,
          total: countRows[0].total
        };
      });

      if (mysqlResult.notifications.length > 0) {
        return {
          notifications: mysqlResult.notifications.map(this.formatNotification),
          pagination: {
            page,
            limit,
            total: mysqlResult.total,
            totalPages: Math.ceil(mysqlResult.total / limit)
          }
        };
      }

      // Fallback to MongoDB
      const mongoDB = this.connectionPool.getMongoDatabase();
      const mongoQuery = this.buildMongoQuery(query);

      const total = await mongoDB.collection('notifications').countDocuments(mongoQuery);
      const notifications = await mongoDB.collection('notifications')
        .find(mongoQuery)
        .sort({ [this.mapSortField(sortBy)]: sortOrder === 'desc' ? -1 : 1 })
        .limit(limit)
        .skip(offset)
        .toArray();

      return {
        notifications: notifications.map(this.formatNotification),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };

    } catch (error) {
      this.logger.error('Error getting notifications', {
        query: query,
        error: error.message
      });
      throw error;
    }
  }

  async handleGetNotificationStatistics(query) {
    try {
      query.validate();

      const { groupBy, startDate, endDate } = query;

      let sql, params = [];

      if (groupBy === 'channel') {
        sql = `
          SELECT channel, COUNT(*) as count, status
          FROM notifications
          WHERE 1=1
        `;
      } else if (groupBy === 'type') {
        sql = `
          SELECT type, COUNT(*) as count, status
          FROM notifications
          WHERE 1=1
        `;
      } else {
        // Time-based grouping
        const dateFormat = groupBy === 'day' ? '%Y-%m-%d' : groupBy === 'week' ? '%Y-%u' : '%Y-%m';
        sql = `
          SELECT DATE_FORMAT(created_at, '${dateFormat}') as period, COUNT(*) as count, status
          FROM notifications
          WHERE 1=1
        `;
      }

      if (query.userId) {
        sql += ' AND user_id = ?';
        params.push(query.userId);
      }
      if (query.type) {
        sql += ' AND type = ?';
        params.push(query.type);
      }
      if (query.channel) {
        sql += ' AND channel = ?';
        params.push(query.channel);
      }
      if (startDate) {
        sql += ' AND created_at >= ?';
        params.push(startDate);
      }
      if (endDate) {
        sql += ' AND created_at <= ?';
        params.push(endDate);
      }

      if (groupBy === 'channel' || groupBy === 'type') {
        sql += ' GROUP BY ' + groupBy + ', status';
      } else {
        sql += ' GROUP BY period, status ORDER BY period';
      }

      const result = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute(sql, params);
        return rows;
      });

      // Aggregate results
      const stats = {
        total: 0,
        byStatus: {},
        byGroup: {}
      };

      result.forEach(row => {
        stats.total += row.count;

        if (!stats.byStatus[row.status]) {
          stats.byStatus[row.status] = 0;
        }
        stats.byStatus[row.status] += row.count;

        const groupKey = row[groupBy] || row.period;
        if (!stats.byGroup[groupKey]) {
          stats.byGroup[groupKey] = {};
        }
        stats.byGroup[groupKey][row.status] = row.count;
      });

      return stats;

    } catch (error) {
      this.logger.error('Error getting notification statistics', {
        query: query,
        error: error.message
      });
      throw error;
    }
  }

  async handleGetUserPreferences(query) {
    try {
      query.validate();

      // Try MySQL first
      const mysqlResult = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute(
          'SELECT * FROM user_notification_preferences WHERE user_id = ?',
          [query.userId]
        );
        return rows[0];
      });

      if (mysqlResult) {
        return {
          userId: mysqlResult.user_id,
          preferences: JSON.parse(mysqlResult.preferences),
          updatedAt: mysqlResult.updated_at
        };
      }

      // Fallback to MongoDB
      const mongoDB = this.connectionPool.getMongoDatabase();
      const mongoResult = await mongoDB.collection('user_notification_preferences').findOne({
        userId: query.userId
      });

      if (mongoResult) {
        return {
          userId: mongoResult.userId,
          preferences: mongoResult.preferences,
          updatedAt: mongoResult.updatedAt
        };
      }

      // Return default preferences
      return {
        userId: query.userId,
        preferences: { email: true, sms: true, push: true, in_app: true },
        updatedAt: null
      };

    } catch (error) {
      this.logger.error('Error getting user preferences', {
        userId: query.userId,
        error: error.message
      });
      throw error;
    }
  }

  async handleGetNotificationTemplates(query) {
    try {
      query.validate();

      const { page, limit, type, channel, active } = query;
      const offset = (page - 1) * limit;

      let whereConditions = [];
      let params = [];

      if (type) {
        whereConditions.push('type = ?');
        params.push(type);
      }
      if (channel) {
        whereConditions.push('channel = ?');
        params.push(channel);
      }
      if (active !== undefined) {
        whereConditions.push('active = ?');
        params.push(active ? 1 : 0);
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      const mysqlResult = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute(
          `SELECT * FROM notification_templates ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
          [...params, limit, offset]
        );

        const [countRows] = await connection.execute(
          `SELECT COUNT(*) as total FROM notification_templates ${whereClause}`,
          params
        );

        return {
          templates: rows,
          total: countRows[0].total
        };
      });

      return {
        templates: mysqlResult.templates.map(this.formatTemplate),
        pagination: {
          page,
          limit,
          total: mysqlResult.total,
          totalPages: Math.ceil(mysqlResult.total / limit)
        }
      };

    } catch (error) {
      this.logger.error('Error getting notification templates', {
        query: query,
        error: error.message
      });
      throw error;
    }
  }

  async handleGetFailedNotifications(query) {
    try {
      query.validate();

      const { page, limit, startDate, endDate, channel, maxRetries } = query;
      const offset = (page - 1) * limit;

      let whereConditions = ['status = ?'];
      let params = ['failed'];

      if (channel) {
        whereConditions.push('channel = ?');
        params.push(channel);
      }
      if (startDate) {
        whereConditions.push('created_at >= ?');
        params.push(startDate);
      }
      if (endDate) {
        whereConditions.push('created_at <= ?');
        params.push(endDate);
      }

      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

      const mysqlResult = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute(
          `SELECT * FROM notifications ${whereClause} AND retry_count < ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
          [...params, maxRetries, limit, offset]
        );

        const [countRows] = await connection.execute(
          `SELECT COUNT(*) as total FROM notifications ${whereClause} AND retry_count < ?`,
          [...params, maxRetries]
        );

        return {
          notifications: rows,
          total: countRows[0].total
        };
      });

      return {
        notifications: mysqlResult.notifications.map(this.formatNotification),
        pagination: {
          page,
          limit,
          total: mysqlResult.total,
          totalPages: Math.ceil(mysqlResult.total / limit)
        }
      };

    } catch (error) {
      this.logger.error('Error getting failed notifications', {
        query: query,
        error: error.message
      });
      throw error;
    }
  }

  // Helper methods
  formatNotification(notification) {
    return {
      id: notification.id,
      userId: notification.user_id || notification.userId,
      type: notification.type,
      channel: notification.channel,
      subject: notification.subject,
      message: notification.message,
      status: notification.status,
      priority: notification.priority,
      retryCount: notification.retry_count || notification.retryCount,
      sentAt: notification.sent_at || notification.sentAt,
      scheduledAt: notification.scheduled_at || notification.scheduledAt,
      createdAt: notification.created_at || notification.createdAt,
      updatedAt: notification.updated_at || notification.updatedAt,
      metadata: typeof notification.metadata === 'string' ?
        JSON.parse(notification.metadata) : notification.metadata
    };
  }

  formatTemplate(template) {
    return {
      id: template.id,
      name: template.name,
      type: template.type,
      channel: template.channel,
      subject: template.subject,
      content: template.content,
      variables: typeof template.variables === 'string' ?
        JSON.parse(template.variables) : template.variables,
      active: template.active,
      createdAt: template.created_at,
      updatedAt: template.updated_at
    };
  }

  buildMongoQuery(query) {
    const mongoQuery = {};

    if (query.userId) mongoQuery.userId = query.userId;
    if (query.type) mongoQuery.type = query.type;
    if (query.channel) mongoQuery.channel = query.channel;
    if (query.status) mongoQuery.status = query.status;
    if (query.priority) mongoQuery.priority = query.priority;
    if (query.startDate || query.endDate) {
      mongoQuery.createdAt = {};
      if (query.startDate) mongoQuery.createdAt.$gte = new Date(query.startDate);
      if (query.endDate) mongoQuery.createdAt.$lte = new Date(query.endDate);
    }

    return mongoQuery;
  }

  mapSortField(field) {
    const fieldMap = {
      createdAt: 'created_at',
      sentAt: 'sent_at',
      updatedAt: 'updated_at',
      priority: 'priority'
    };
    return fieldMap[field] || field;
  }
}