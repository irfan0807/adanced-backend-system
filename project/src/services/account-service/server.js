import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import DatabaseConnectionPool from '../../shared/database/connection-pool.js';
import DualDatabaseWriter from '../../shared/database/dual-writer.js';
import { KafkaService } from '../../shared/messaging/kafka-service.js';
import EventStore from '../../shared/event-sourcing/event-store.js';
import CommandBus from '../../shared/cqrs/command-bus.js';
import QueryBus from '../../shared/cqrs/query-bus.js';
import { AccountService } from './account-service.js';
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
const dualWriter = new DualDatabaseWriter(connectionPool);
const eventStore = new EventStore(connectionPool, kafkaService);
const commandBus = new CommandBus();
const queryBus = new QueryBus();

// Initialize Account Service
const accountService = new AccountService({
  connectionPool,
  dualWriter,
  eventStore,
  kafkaService,
  commandBus,
  queryBus,
  logger
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    body: req.method !== 'GET' ? req.body : undefined
  });
  next();
});

// Routes

// Account CRUD Routes
app.post('/accounts', async (req, res) => {
  try {
    const {
      id,
      userId,
      accountType,
      currency,
      initialBalance,
      accountName,
      description,
      metadata
    } = req.body;

    if (!userId || !accountType) {
      return res.status(400).json({
        success: false,
        error: 'userId and accountType are required',
        timestamp: new Date().toISOString()
      });
    }

    const account = await accountService.createAccount({
      id,
      userId,
      accountType,
      currency: currency || 'USD',
      initialBalance: initialBalance || 0,
      accountName,
      description,
      metadata
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

app.get('/accounts/:id', async (req, res) => {
  try {
    const account = await accountService.getAccount(req.params.id);
    res.json({
      success: true,
      data: account,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting account:', error);
    if (error.message === 'Account not found') {
      res.status(404).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
});

app.get('/accounts', async (req, res) => {
  try {
    const {
      userId,
      accountType,
      currency,
      status,
      page = 1,
      limit = 10
    } = req.query;

    const filters = {};
    if (userId) filters.userId = userId;
    if (accountType) filters.accountType = accountType;
    if (currency) filters.currency = currency;
    if (status) filters.status = status;

    const result = await accountService.getAccounts(filters, parseInt(page), parseInt(limit));
    res.json({
      success: true,
      data: result,
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

app.put('/accounts/:id', async (req, res) => {
  try {
    const { updates, updatedBy } = req.body;

    if (!updates || !updatedBy) {
      return res.status(400).json({
        success: false,
        error: 'updates and updatedBy are required',
        timestamp: new Date().toISOString()
      });
    }

    const account = await accountService.updateAccount(req.params.id, { ...updates, updatedBy });
    res.json({
      success: true,
      data: account,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error updating account:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Account Status Routes
app.put('/accounts/:id/suspend', async (req, res) => {
  try {
    const { reason, suspendedBy } = req.body;

    if (!suspendedBy) {
      return res.status(400).json({
        success: false,
        error: 'suspendedBy is required',
        timestamp: new Date().toISOString()
      });
    }

    const account = await accountService.suspendAccount(req.params.id, reason, suspendedBy);
    res.json({
      success: true,
      data: account,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error suspending account:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.put('/accounts/:id/activate', async (req, res) => {
  try {
    const { activatedBy } = req.body;

    if (!activatedBy) {
      return res.status(400).json({
        success: false,
        error: 'activatedBy is required',
        timestamp: new Date().toISOString()
      });
    }

    const account = await accountService.activateAccount(req.params.id, activatedBy);
    res.json({
      success: true,
      data: account,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error activating account:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.put('/accounts/:id/close', async (req, res) => {
  try {
    const { reason, closedBy } = req.body;

    if (!closedBy) {
      return res.status(400).json({
        success: false,
        error: 'closedBy is required',
        timestamp: new Date().toISOString()
      });
    }

    const account = await accountService.closeAccount(req.params.id, reason, closedBy);
    res.json({
      success: true,
      data: account,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error closing account:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Transaction Routes
app.post('/accounts/:id/deposit', async (req, res) => {
  try {
    const { amount, currency, description, reference, depositedBy } = req.body;

    if (!amount || !depositedBy) {
      return res.status(400).json({
        success: false,
        error: 'amount and depositedBy are required',
        timestamp: new Date().toISOString()
      });
    }

    const result = await accountService.depositFunds(
      req.params.id,
      amount,
      currency || 'USD',
      description,
      reference,
      depositedBy
    );

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error depositing funds:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/accounts/:id/withdraw', async (req, res) => {
  try {
    const { amount, currency, description, reference, withdrawnBy } = req.body;

    if (!amount || !withdrawnBy) {
      return res.status(400).json({
        success: false,
        error: 'amount and withdrawnBy are required',
        timestamp: new Date().toISOString()
      });
    }

    const result = await accountService.withdrawFunds(
      req.params.id,
      amount,
      currency || 'USD',
      description,
      reference,
      withdrawnBy
    );

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error withdrawing funds:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/accounts/transfer', async (req, res) => {
  try {
    const {
      fromAccountId,
      toAccountId,
      amount,
      currency,
      description,
      reference,
      transferredBy
    } = req.body;

    if (!fromAccountId || !toAccountId || !amount || !transferredBy) {
      return res.status(400).json({
        success: false,
        error: 'fromAccountId, toAccountId, amount, and transferredBy are required',
        timestamp: new Date().toISOString()
      });
    }

    const result = await accountService.transferFunds(
      fromAccountId,
      toAccountId,
      amount,
      currency || 'USD',
      description,
      reference,
      transferredBy
    );

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error transferring funds:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Query Routes
app.get('/accounts/:id/balance', async (req, res) => {
  try {
    const balance = await accountService.getAccountBalance(req.params.id);
    res.json({
      success: true,
      data: balance,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting account balance:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/accounts/:id/transactions', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      page = 1,
      limit = 20
    } = req.query;

    const result = await accountService.getAccountTransactions(
      req.params.id,
      startDate,
      endDate,
      parseInt(page),
      parseInt(limit)
    );

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting account transactions:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/accounts/:id/statement', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required',
        timestamp: new Date().toISOString()
      });
    }

    const statement = await accountService.getAccountStatement(
      req.params.id,
      startDate,
      endDate
    );

    res.json({
      success: true,
      data: statement,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting account statement:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/accounts/summary/user/:userId', async (req, res) => {
  try {
    const summary = await accountService.getAccountSummary(req.params.userId);
    res.json({
      success: true,
      data: summary,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting account summary:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/accounts/validate-transfer', async (req, res) => {
  try {
    const { fromAccountId, toAccountId, amount } = req.body;

    if (!fromAccountId || !toAccountId || !amount) {
      return res.status(400).json({
        success: false,
        error: 'fromAccountId, toAccountId, and amount are required',
        timestamp: new Date().toISOString()
      });
    }

    const validation = await accountService.validateAccountTransfer(
      fromAccountId,
      toAccountId,
      amount
    );

    res.json({
      success: true,
      data: validation,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error validating transfer:', error);
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

// Initialize service
async function initializeService() {
  try {
    await connectionPool.initialize();
    await kafkaService.initialize();
    await accountService.initialize();

    logger.info(`Account Service started on port ${PORT}`);
  } catch (error) {
    logger.error('Failed to initialize Account Service:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await connectionPool.close();
  await kafkaService.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await connectionPool.close();
  await kafkaService.close();
  process.exit(0);
});

app.listen(PORT, () => {
  initializeService();
});

export default app;