import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { v4 as uuidv4 } from 'uuid';
import DatabaseConnectionPool from '../../shared/database/connection-pool.js';
import { KafkaService } from '../../shared/messaging/kafka-service.js';
import winston from 'winston';

const app = express();
const PORT = process.env.ACCOUNT_SERVICE_PORT || 3002;

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/account-service.log' })
  ]
});

// Initialize dependencies
const connectionPool = new DatabaseConnectionPool();
const kafkaService = new KafkaService();

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));

// Routes
app.post('/accounts', async (req, res) => {
  try {
    const { userId, accountType, currency } = req.body;

    // Create account logic here
    const accountId = uuidv4();
    const account = {
      id: accountId,
      userId,
      accountType: accountType || 'checking',
      currency: currency || 'USD',
      balance: 0,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Insert into MySQL
    await connectionPool.executeWithMySQLConnection(async (connection) => {
      await connection.execute(
        'INSERT INTO accounts (id, user_id, account_type, currency, balance, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())',
        [account.id, account.userId, account.accountType, account.currency, account.balance, account.status]
      );
    });

    // Insert into MongoDB
    const mongoDB = connectionPool.getMongoDatabase();
    await mongoDB.collection('accounts').insertOne({
      id: account.id,
      userId: account.userId,
      accountType: account.accountType,
      currency: account.currency,
      balance: account.balance,
      status: account.status,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Publish account created event
    await kafkaService.produce('account-events', {
      eventType: 'ACCOUNT_CREATED',
      accountId: account.id,
      userId: account.userId,
      timestamp: new Date().toISOString()
    });

    res.status(201).json({
      success: true,
      data: account,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error creating account:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/accounts', async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const accounts = await getAllAccounts({ page: parseInt(page), limit: parseInt(limit), status });
    res.json({
      success: true,
      data: accounts,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting accounts:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/accounts/user/:userId', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    // Get user accounts logic here
    const accounts = await getAccountsByUserId(req.params.userId, { page: parseInt(page), limit: parseInt(limit) });
    res.json({
      success: true,
      data: accounts,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting user accounts:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.put('/accounts/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['active', 'inactive', 'suspended'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Must be active, inactive, or suspended',
        timestamp: new Date().toISOString()
      });
    }

    // Update status logic here
    const account = await updateAccountStatus(req.params.id, status);

    res.json({
      success: true,
      data: account,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error updating account status:', error);
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
    service: 'account-service',
    timestamp: new Date().toISOString(),
    dependencies: {
      database: connectionPool.getStats()
    }
  });
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
  res.json({
    service: 'account-service',
    timestamp: new Date().toISOString(),
    database: connectionPool.getStats()
  });
});

// Helper functions (implement database queries)
async function getAccountById(accountId) {
  try {
    // Try MySQL first (primary)
    const mysqlResult = await connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT * FROM accounts WHERE id = ? AND status = "active"',
        [accountId]
      );
      return rows[0];
    });

    if (mysqlResult) {
      return mysqlResult;
    }

    // Fallback to MongoDB
    const mongoDB = connectionPool.getMongoDatabase();
    const mongoResult = await mongoDB.collection('accounts').findOne({
      id: accountId,
      status: 'active'
    });

    return mongoResult;
  } catch (error) {
    logger.error('Error getting account by ID:', error);
    throw error;
  }
}

async function getAccountsByUserId(userId, options = {}) {
  try {
    const { page = 1, limit = 20 } = options;
    const offset = (page - 1) * limit;

    // Try MySQL first (primary)
    const mysqlResult = await connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT * FROM accounts WHERE user_id = ? AND status = "active" ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [userId, limit, offset]
      );
      return rows;
    });

    if (mysqlResult && mysqlResult.length > 0) {
      return mysqlResult;
    }

    // Fallback to MongoDB
    const mongoDB = connectionPool.getMongoDatabase();
    const mongoResult = await mongoDB.collection('accounts')
      .find({
        userId: userId,
        status: 'active'
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(offset)
      .toArray();

    return mongoResult;
  } catch (error) {
    logger.error('Error getting accounts by user ID:', error);
    throw error;
  }
}

async function getAllAccounts(options = {}) {
  try {
    const { page = 1, limit = 20, status } = options;
    const offset = (page - 1) * limit;

    let whereClause = '';
    let params = [limit, offset];
    if (status) {
      whereClause = 'WHERE status = ?';
      params = [status, limit, offset];
    }

    // Try MySQL first (primary)
    const mysqlResult = await connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT * FROM accounts ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        params
      );
      return rows;
    });

    if (mysqlResult && mysqlResult.length > 0) {
      return mysqlResult;
    }

    // Fallback to MongoDB
    const mongoDB = connectionPool.getMongoDatabase();
    const query = status ? { status } : {};
    const mongoResult = await mongoDB.collection('accounts')
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(offset)
      .toArray();

    return mongoResult;
  } catch (error) {
    logger.error('Error getting all accounts:', error);
    throw error;
  }
}

async function updateAccountBalance(accountId, amount, operation) {
  try {
    // Get current account
    const account = await getAccountById(accountId);
    if (!account) {
      throw new Error('Account not found');
    }

    let newBalance = parseFloat(account.balance || 0);
    const changeAmount = parseFloat(amount);

    // Calculate new balance based on operation
    if (operation === 'credit') {
      newBalance += changeAmount;
    } else if (operation === 'debit') {
      newBalance -= changeAmount;
      if (newBalance < 0) {
        throw new Error('Insufficient funds');
      }
    } else {
      throw new Error('Invalid operation type');
    }

    // Update in both databases
    const updatedAccount = {
      ...account,
      balance: newBalance,
      updatedAt: new Date().toISOString()
    };

    // Update MySQL
    await connectionPool.executeWithMySQLConnection(async (connection) => {
      await connection.beginTransaction();
      try {
        await connection.execute(
          'UPDATE accounts SET balance = ?, updated_at = NOW() WHERE id = ?',
          [newBalance, accountId]
        );

        // Log balance change
        await connection.execute(
          'INSERT INTO account_balance_changes (account_id, previous_balance, new_balance, change_amount, operation, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
          [accountId, account.balance, newBalance, changeAmount, operation]
        );

        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    });

    // Update MongoDB
    const mongoDB = connectionPool.getMongoDatabase();
    await mongoDB.collection('accounts').updateOne(
      { id: accountId },
      {
        $set: {
          balance: newBalance,
          updatedAt: new Date()
        },
        $push: {
          balanceChanges: {
            previousBalance: account.balance,
            newBalance,
            changeAmount,
            operation,
            timestamp: new Date()
          }
        }
      }
    );

    // Publish balance updated event
    await kafkaService.produce('account-events', {
      eventType: 'ACCOUNT_BALANCE_UPDATED',
      accountId: accountId,
      previousBalance: account.balance,
      newBalance: newBalance,
      changeAmount: changeAmount,
      operation: operation,
      timestamp: new Date().toISOString()
    });

    return updatedAccount;
  } catch (error) {
    logger.error('Error updating account balance:', error);
    throw error;
  }
}

async function updateAccountStatus(accountId, status) {
  try {
    // Get current account
    const account = await getAccountById(accountId);
    if (!account) {
      throw new Error('Account not found');
    }

    // Update in MySQL
    await connectionPool.executeWithMySQLConnection(async (connection) => {
      await connection.execute(
        'UPDATE accounts SET status = ?, updated_at = NOW() WHERE id = ?',
        [status, accountId]
      );
    });

    // Update in MongoDB
    const mongoDB = connectionPool.getMongoDatabase();
    await mongoDB.collection('accounts').updateOne(
      { id: accountId },
      {
        $set: {
          status: status,
          updatedAt: new Date()
        }
      }
    );

    const updatedAccount = {
      ...account,
      status,
      updatedAt: new Date().toISOString()
    };

    // Publish status updated event
    await kafkaService.produce('account-events', {
      eventType: 'ACCOUNT_STATUS_UPDATED',
      accountId: accountId,
      previousStatus: account.status,
      newStatus: status,
      timestamp: new Date().toISOString()
    });

    return updatedAccount;
  } catch (error) {
    logger.error('Error updating account status:', error);
    throw error;
  }
}

// Initialize service
async function initializeService() {
  try {
    await connectionPool.initialize();
    await kafkaService.initialize();

    logger.info(`Account Service started on port ${PORT}`);
  } catch (error) {
    logger.error('Failed to initialize Account Service:', error);
    process.exit(1);
  }
}

app.listen(PORT, () => {
  initializeService();
});

export default app;