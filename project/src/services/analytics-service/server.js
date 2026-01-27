import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import DatabaseConnectionPool from '../../shared/database/connection-pool.js';
import DualDatabaseWriter from '../../shared/database/dual-writer.js';
import { KafkaService } from '../../shared/messaging/kafka-service.js';
import winston from 'winston';

const app = express();
const PORT = process.env.ANALYTICS_SERVICE_PORT || 3007;

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/analytics-service.log' })
  ]
});

// Initialize dependencies
const connectionPool = new DatabaseConnectionPool();
const kafkaService = new KafkaService();
const dualWriter = new DualDatabaseWriter(connectionPool);

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));

// Routes
app.get('/analytics/transactions/summary', async (req, res) => {
  try {
    const { startDate, endDate, groupBy = 'day' } = req.query;

    // Get transaction summary analytics logic here
    const summary = await getTransactionSummary({
      startDate,
      endDate,
      groupBy
    });

    res.json({
      success: true,
      data: summary,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting transaction summary:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/analytics/users/activity', async (req, res) => {
  try {
    const { startDate, endDate, metric = 'transactions' } = req.query;

    // Get user activity analytics logic here
    const activity = await getUserActivityAnalytics({
      startDate,
      endDate,
      metric
    });

    res.json({
      success: true,
      data: activity,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting user activity analytics:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/analytics/payments/methods', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Get payment methods analytics logic here
    const methods = await getPaymentMethodsAnalytics({
      startDate,
      endDate
    });

    res.json({
      success: true,
      data: methods,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting payment methods analytics:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/analytics/revenue', async (req, res) => {
  try {
    const { startDate, endDate, groupBy = 'month' } = req.query;

    // Get revenue analytics logic here
    const revenue = await getRevenueAnalytics({
      startDate,
      endDate,
      groupBy
    });

    res.json({
      success: true,
      data: revenue,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting revenue analytics:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/analytics/accounts/summary', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Get account analytics logic here
    const summary = await getAccountAnalytics({
      startDate,
      endDate
    });

    res.json({
      success: true,
      data: summary,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting account analytics:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Event consumers for real-time analytics updates
const eventConsumers = {
  'transaction-events': async (message) => {
    try {
      const event = JSON.parse(message.value.toString());
      await updateTransactionAnalytics(event);
    } catch (error) {
      logger.error('Error processing transaction event:', error);
    }
  },
  'account-events': async (message) => {
    try {
      const event = JSON.parse(message.value.toString());
      await updateAccountAnalytics(event);
    } catch (error) {
      logger.error('Error processing account event:', error);
    }
  },
  'payment-events': async (message) => {
    try {
      const event = JSON.parse(message.value.toString());
      await updatePaymentAnalytics(event);
    } catch (error) {
      logger.error('Error processing payment event:', error);
    }
  },
  'user-events': async (message) => {
    try {
      const event = JSON.parse(message.value.toString());
      await updateUserAnalytics(event);
    } catch (error) {
      logger.error('Error processing user event:', error);
    }
  }
};

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'analytics-service',
    timestamp: new Date().toISOString(),
    dependencies: {
      database: connectionPool.getStats(),
      dualWriter: dualWriter.getStats()
    }
  });
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
  res.json({
    service: 'analytics-service',
    timestamp: new Date().toISOString(),
    database: connectionPool.getStats(),
    dualWriter: dualWriter.getStats()
  });
});

// Helper functions
async function getTransactionSummary(filters) {
  try {
    const { startDate, endDate, groupBy = 'day' } = filters;

    // Build date filter
    let dateFilter = '';
    let dateParams = [];

    if (startDate) {
      dateFilter += ' AND created_at >= ?';
      dateParams.push(startDate);
    }

    if (endDate) {
      dateFilter += ' AND created_at <= ?';
      dateParams.push(endDate);
    }

    // Get transaction summary from MySQL
    const summary = await connectionPool.executeWithMySQLConnection(async (connection) => {
      // Total transactions and volume
      const [totalStats] = await connection.execute(
        `SELECT
          COUNT(*) as totalTransactions,
          COALESCE(SUM(amount), 0) as totalVolume,
          COALESCE(AVG(amount), 0) as averageTransactionValue
        FROM transactions
        WHERE status = 'completed' ${dateFilter}`,
        dateParams
      );

      // Transactions by status
      const [statusStats] = await connection.execute(
        `SELECT status, COUNT(*) as count
        FROM transactions
        WHERE 1=1 ${dateFilter}
        GROUP BY status`,
        dateParams
      );

      // Timeline data based on groupBy
      let groupByClause = '';
      switch (groupBy) {
        case 'hour':
          groupByClause = 'DATE_FORMAT(created_at, "%Y-%m-%d %H:00:00")';
          break;
        case 'day':
          groupByClause = 'DATE(created_at)';
          break;
        case 'week':
          groupByClause = 'DATE_SUB(created_at, INTERVAL WEEKDAY(created_at) DAY)';
          break;
        case 'month':
          groupByClause = 'DATE_FORMAT(created_at, "%Y-%m-01")';
          break;
        default:
          groupByClause = 'DATE(created_at)';
      }

      const [timelineStats] = await connection.execute(
        `SELECT
          ${groupByClause} as period,
          COUNT(*) as transactionCount,
          COALESCE(SUM(amount), 0) as volume
        FROM transactions
        WHERE status = 'completed' ${dateFilter}
        GROUP BY ${groupByClause}
        ORDER BY period`,
        dateParams
      );

      return {
        totalTransactions: totalStats[0]?.totalTransactions || 0,
        totalVolume: parseFloat(totalStats[0]?.totalVolume || 0),
        averageTransactionValue: parseFloat(totalStats[0]?.averageTransactionValue || 0),
        transactionsByStatus: statusStats.reduce((acc, stat) => {
          acc[stat.status] = stat.count;
          return acc;
        }, {}),
        timeline: timelineStats.map(stat => ({
          period: stat.period,
          transactionCount: stat.transactionCount,
          volume: parseFloat(stat.volume)
        }))
      };
    });

    return summary;
  } catch (error) {
    logger.error('Error getting transaction summary:', error);
    throw error;
  }
}

async function getUserActivityAnalytics(filters) {
  try {
    const { startDate, endDate, metric = 'transactions' } = filters;

    // Build date filter
    let dateFilter = '';
    let dateParams = [];

    if (startDate) {
      dateFilter += ' AND created_at >= ?';
      dateParams.push(startDate);
    }

    if (endDate) {
      dateFilter += ' AND created_at <= ?';
      dateParams.push(endDate);
    }

    const analytics = await connectionPool.executeWithMySQLConnection(async (connection) => {
      let query, params;

      switch (metric) {
        case 'transactions':
          // Active users based on transactions
          [query, params] = [
            `SELECT
              COUNT(DISTINCT user_id) as activeUsers,
              COUNT(*) as totalSessions
            FROM transactions
            WHERE 1=1 ${dateFilter}`,
            dateParams
          ];
          break;

        case 'logins':
          // This would come from user service audit logs
          [query, params] = [
            `SELECT
              COUNT(DISTINCT user_id) as activeUsers,
              COUNT(*) as totalSessions
            FROM audit_logs
            WHERE action = 'LOGIN' ${dateFilter}`,
            dateParams
          ];
          break;

        default:
          [query, params] = [
            `SELECT
              COUNT(DISTINCT user_id) as activeUsers,
              COUNT(*) as totalSessions
            FROM transactions
            WHERE 1=1 ${dateFilter}`,
            dateParams
          ];
      }

      const [activityStats] = await connection.execute(query, params);

      // New users (users who made their first transaction in the period)
      const [newUsersStats] = await connection.execute(
        `SELECT COUNT(*) as newUsers
        FROM (
          SELECT user_id, MIN(created_at) as first_transaction
          FROM transactions
          GROUP BY user_id
          HAVING first_transaction >= ? AND first_transaction <= ?
        ) as first_transactions`,
        [startDate || '1970-01-01', endDate || '2030-12-31']
      );

      // User retention (simplified: users who had transactions in both current and previous period)
      const previousPeriodEnd = new Date(startDate || new Date());
      previousPeriodEnd.setDate(previousPeriodEnd.getDate() - 1);
      const previousPeriodStart = new Date(previousPeriodEnd);
      previousPeriodStart.setDate(previousPeriodStart.getDate() - (endDate ? (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24) : 30));

      const [retentionStats] = await connection.execute(
        `SELECT COUNT(DISTINCT t1.user_id) as retainedUsers
        FROM transactions t1
        INNER JOIN transactions t2 ON t1.user_id = t2.user_id
        WHERE t1.created_at >= ? AND t1.created_at <= ?
        AND t2.created_at >= ? AND t2.created_at <= ?`,
        [startDate || '1970-01-01', endDate || '2030-12-31', previousPeriodStart.toISOString(), previousPeriodEnd.toISOString()]
      );

      const retentionRate = activityStats[0]?.activeUsers ? (retentionStats[0]?.retainedUsers / activityStats[0].activeUsers) * 100 : 0;

      // Activity timeline (daily active users)
      const [timelineStats] = await connection.execute(
        `SELECT DATE(created_at) as date, COUNT(DISTINCT user_id) as activeUsers
        FROM transactions
        WHERE created_at >= ? AND created_at <= ?
        GROUP BY DATE(created_at)
        ORDER BY date`,
        [startDate || '1970-01-01', endDate || '2030-12-31']
      );

      return {
        activeUsers: activityStats[0]?.activeUsers || 0,
        newUsers: newUsersStats[0]?.newUsers || 0,
        totalSessions: activityStats[0]?.totalSessions || 0,
        userRetention: retentionRate,
        activityTimeline: timelineStats.map(stat => ({
          date: stat.date,
          activeUsers: stat.activeUsers
        }))
      };
    });

    return analytics;
  } catch (error) {
    logger.error('Error getting user activity analytics:', error);
    throw error;
  }
}

async function getPaymentMethodsAnalytics(filters) {
  try {
    const { startDate, endDate } = filters;

    // Build date filter
    let dateFilter = '';
    let dateParams = [];

    if (startDate) {
      dateFilter += ' AND created_at >= ?';
      dateParams.push(startDate);
    }

    if (endDate) {
      dateFilter += ' AND created_at <= ?';
      dateParams.push(endDate);
    }

    const analytics = await connectionPool.executeWithMySQLConnection(async (connection) => {
      const [methodStats] = await connection.execute(
        `SELECT
          payment_method,
          COUNT(*) as count,
          COALESCE(SUM(amount), 0) as totalAmount
        FROM payments
        WHERE status = 'completed' ${dateFilter}
        GROUP BY payment_method
        ORDER BY totalAmount DESC`,
        dateParams
      );

      return {
        methods: methodStats.map(stat => ({
          method: stat.payment_method,
          count: stat.count,
          totalAmount: parseFloat(stat.totalAmount)
        })),
        totalByMethod: methodStats.reduce((acc, stat) => {
          acc[stat.payment_method] = parseFloat(stat.totalAmount);
          return acc;
        }, {})
      };
    });

    return analytics;
  } catch (error) {
    logger.error('Error getting payment methods analytics:', error);
    throw error;
  }
}

async function getRevenueAnalytics(filters) {
  try {
    const { startDate, endDate, groupBy = 'month' } = filters;

    // Build date filter
    let dateFilter = '';
    let dateParams = [];

    if (startDate) {
      dateFilter += ' AND created_at >= ?';
      dateParams.push(startDate);
    }

    if (endDate) {
      dateFilter += ' AND created_at <= ?';
      dateParams.push(endDate);
    }

    const analytics = await connectionPool.executeWithMySQLConnection(async (connection) => {
      // Revenue by period
      let groupByClause = '';
      switch (groupBy) {
        case 'day':
          groupByClause = 'DATE(created_at)';
          break;
        case 'week':
          groupByClause = 'DATE_SUB(created_at, INTERVAL WEEKDAY(created_at) DAY)';
          break;
        case 'month':
          groupByClause = 'DATE_FORMAT(created_at, "%Y-%m-01")';
          break;
        case 'year':
          groupByClause = 'DATE_FORMAT(created_at, "%Y-01-01")';
          break;
        default:
          groupByClause = 'DATE_FORMAT(created_at, "%Y-%m-01")';
      }

      const [revenueStats] = await connection.execute(
        `SELECT
          ${groupByClause} as period,
          COALESCE(SUM(amount), 0) as revenue,
          COUNT(*) as transactionCount
        FROM transactions
        WHERE status = 'completed' ${dateFilter}
        GROUP BY ${groupByClause}
        ORDER BY period`,
        dateParams
      );

      const totalRevenue = revenueStats.reduce((sum, stat) => sum + parseFloat(stat.revenue), 0);
      const growthRate = revenueStats.length > 1 ?
        ((revenueStats[revenueStats.length - 1].revenue - revenueStats[0].revenue) / revenueStats[0].revenue) * 100 : 0;

      return {
        totalRevenue: totalRevenue,
        revenueByPeriod: revenueStats.map(stat => ({
          period: stat.period,
          revenue: parseFloat(stat.revenue),
          transactionCount: stat.transactionCount
        })),
        growthRate: growthRate
      };
    });

    return analytics;
  } catch (error) {
    logger.error('Error getting revenue analytics:', error);
    throw error;
  }
}

async function getDashboardMetrics() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const thisMonth = new Date().toISOString().substring(0, 7) + '-01';

    const metrics = await connectionPool.executeWithMySQLConnection(async (connection) => {
      // Total users
      const [userStats] = await connection.execute(
        'SELECT COUNT(*) as totalUsers FROM users WHERE status = "active"'
      );

      // Total transactions
      const [transactionStats] = await connection.execute(
        'SELECT COUNT(*) as totalTransactions, COALESCE(SUM(amount), 0) as totalRevenue FROM transactions WHERE status = "completed"'
      );

      // Today's metrics
      const [todayStats] = await connection.execute(
        `SELECT
          COUNT(*) as transactionsToday,
          COALESCE(SUM(amount), 0) as revenueToday
        FROM transactions
        WHERE status = "completed" AND DATE(created_at) = ?`,
        [today]
      );

      // Active users today (users who had transactions)
      const [activeUsersToday] = await connection.execute(
        `SELECT COUNT(DISTINCT user_id) as activeUsersToday
        FROM transactions
        WHERE DATE(created_at) = ?`,
        [today]
      );

      return {
        totalUsers: userStats[0]?.totalUsers || 0,
        totalTransactions: transactionStats[0]?.totalTransactions || 0,
        totalRevenue: parseFloat(transactionStats[0]?.totalRevenue || 0),
        activeUsersToday: activeUsersToday[0]?.activeUsersToday || 0,
        transactionsToday: todayStats[0]?.transactionsToday || 0,
        revenueToday: parseFloat(todayStats[0]?.revenueToday || 0)
      };
    });

    return metrics;
  } catch (error) {
    logger.error('Error getting dashboard metrics:', error);
    throw error;
  }
}

async function getAccountAnalytics(filters) {
  try {
    const { startDate, endDate } = filters;

    // Build date filter
    let dateFilter = '';
    let dateParams = [];

    if (startDate) {
      dateFilter += ' AND created_at >= ?';
      dateParams.push(startDate);
    }

    if (endDate) {
      dateFilter += ' AND created_at <= ?';
      dateParams.push(endDate);
    }

    const analytics = await connectionPool.executeWithMySQLConnection(async (connection) => {
      // Total accounts
      const [totalAccounts] = await connection.execute(
        'SELECT COUNT(*) as totalAccounts FROM accounts WHERE status = "active"'
      );

      // New accounts in period
      const [newAccounts] = await connection.execute(
        `SELECT COUNT(*) as newAccounts FROM accounts WHERE 1=1 ${dateFilter}`,
        dateParams
      );

      // Accounts by type
      const [accountsByType] = await connection.execute(
        'SELECT account_type, COUNT(*) as count FROM accounts WHERE status = "active" GROUP BY account_type'
      );

      // Accounts by currency
      const [accountsByCurrency] = await connection.execute(
        'SELECT currency, COUNT(*) as count FROM accounts WHERE status = "active" GROUP BY currency'
      );

      // Total balance by currency
      const [balancesByCurrency] = await connection.execute(
        'SELECT currency, SUM(balance) as totalBalance FROM accounts WHERE status = "active" GROUP BY currency'
      );

      return {
        totalAccounts: totalAccounts[0]?.totalAccounts || 0,
        newAccounts: newAccounts[0]?.newAccounts || 0,
        accountsByType: accountsByType.reduce((acc, stat) => {
          acc[stat.account_type] = stat.count;
          return acc;
        }, {}),
        accountsByCurrency: accountsByCurrency.reduce((acc, stat) => {
          acc[stat.currency] = stat.count;
          return acc;
        }, {}),
        totalBalances: balancesByCurrency.reduce((acc, stat) => {
          acc[stat.currency] = parseFloat(stat.totalBalance || 0);
          return acc;
        }, {})
      };
    });

    return analytics;
  } catch (error) {
    logger.error('Error getting account analytics:', error);
    throw error;
  }
}

// Event processing functions for real-time analytics
async function updateTransactionAnalytics(event) {
  try {
    const { eventType, transactionId, amount, status, timestamp } = event;

    // Update daily transaction metrics
    const date = new Date(timestamp).toISOString().split('T')[0];

    await connectionPool.executeWithMySQLConnection(async (connection) => {
      // Insert or update daily transaction summary
      await connection.execute(
        `INSERT INTO daily_transaction_metrics (date, total_transactions, total_volume, completed_transactions)
         VALUES (?, 1, ?, ?)
         ON DUPLICATE KEY UPDATE
         total_transactions = total_transactions + 1,
         total_volume = total_volume + VALUES(total_volume),
         completed_transactions = completed_transactions + VALUES(completed_transactions)`,
        [date, amount || 0, status === 'completed' ? 1 : 0]
      );

      // Update transaction status counts
      await connection.execute(
        `INSERT INTO transaction_status_counts (date, status, count)
         VALUES (?, ?, 1)
         ON DUPLICATE KEY UPDATE count = count + 1`,
        [date, status]
      );
    });

    logger.info(`Updated transaction analytics for event: ${eventType}`);
  } catch (error) {
    logger.error('Error updating transaction analytics:', error);
  }
}

async function updateAccountAnalytics(event) {
  try {
    const { eventType, accountId, userId, timestamp } = event;

    if (eventType === 'ACCOUNT_CREATED') {
      const date = new Date(timestamp).toISOString().split('T')[0];

      await connectionPool.executeWithMySQLConnection(async (connection) => {
        await connection.execute(
          `INSERT INTO daily_account_metrics (date, new_accounts)
           VALUES (?, 1)
           ON DUPLICATE KEY UPDATE new_accounts = new_accounts + 1`,
          [date]
        );
      });
    }

    logger.info(`Updated account analytics for event: ${eventType}`);
  } catch (error) {
    logger.error('Error updating account analytics:', error);
  }
}

async function updatePaymentAnalytics(event) {
  try {
    const { eventType, paymentId, method, amount, status, timestamp } = event;

    if (status === 'completed') {
      const date = new Date(timestamp).toISOString().split('T')[0];

      await connectionPool.executeWithMySQLConnection(async (connection) => {
        await connection.execute(
          `INSERT INTO daily_payment_metrics (date, method, volume, count)
           VALUES (?, ?, ?, 1)
           ON DUPLICATE KEY UPDATE
           volume = volume + VALUES(volume),
           count = count + 1`,
          [date, method, amount || 0]
        );
      });
    }

    logger.info(`Updated payment analytics for event: ${eventType}`);
  } catch (error) {
    logger.error('Error updating payment analytics:', error);
  }
}

async function updateUserAnalytics(event) {
  try {
    const { eventType, userId, timestamp } = event;

    if (eventType === 'USER_REGISTERED') {
      const date = new Date(timestamp).toISOString().split('T')[0];

      await connectionPool.executeWithMySQLConnection(async (connection) => {
        await connection.execute(
          `INSERT INTO daily_user_metrics (date, new_users)
           VALUES (?, 1)
           ON DUPLICATE KEY UPDATE new_users = new_users + 1`,
          [date]
        );
      });
    }

    logger.info(`Updated user analytics for event: ${eventType}`);
  } catch (error) {
    logger.error('Error updating user analytics:', error);
  }
}

// Initialize service
async function initializeService() {
  try {
    await connectionPool.initialize();
    await kafkaService.initialize();

    // Start event consumers
    const topics = Object.keys(eventConsumers);
    await kafkaService.consumeMessages(topics, 'analytics-service-group', async (message) => {
      const handler = eventConsumers[message.topic];
      if (handler) {
        await handler(message);
      }
    });

    logger.info(`Analytics Service started on port ${PORT}`);
  } catch (error) {
    logger.error('Failed to initialize Analytics Service:', error);
    process.exit(1);
  }
}

app.listen(PORT, () => {
  initializeService();
});

export default app;