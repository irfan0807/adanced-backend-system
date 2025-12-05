import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { TransactionService } from './transaction-service.js';
import DatabaseConnectionPool from '../../shared/database/connection-pool.js';
import DualDatabaseWriter from '../../shared/database/dual-writer.js';
import { KafkaService } from '../../shared/messaging/kafka-service.js';
import EventStore from '../../shared/event-sourcing/event-store.js';
import CommandBus from '../../shared/cqrs/command-bus.js';
import QueryBus from '../../shared/cqrs/query-bus.js';
import winston from 'winston';

const app = express();
const PORT = process.env.TRANSACTION_SERVICE_PORT || 3003;

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/transaction-service.log' })
  ]
});

// Initialize dependencies
const connectionPool = new DatabaseConnectionPool();
const kafkaService = new KafkaService();
const dualWriter = new DualDatabaseWriter(connectionPool);
const eventStore = new EventStore(connectionPool, kafkaService);
const commandBus = new CommandBus();
const queryBus = new QueryBus();

// Initialize services
const transactionService = new TransactionService({
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
app.post('/transactions', async (req, res) => {
  try {
    const transaction = await transactionService.createTransaction(req.body);
    res.status(201).json({
      success: true,
      data: transaction,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error creating transaction:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/transactions/:id', async (req, res) => {
  try {
    const transaction = await transactionService.getTransaction(req.params.id);
    res.json({
      success: true,
      data: transaction,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting transaction:', error);
    res.status(404).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.put('/transactions/:id/status', async (req, res) => {
  try {
    const transaction = await transactionService.updateTransactionStatus(
      req.params.id, 
      req.body.status
    );
    res.json({
      success: true,
      data: transaction,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error updating transaction status:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/transactions', async (req, res) => {
  try {
    const { page = 1, limit = 20, status, userId } = req.query;
    const transactions = await transactionService.getTransactions({
      page: parseInt(page),
      limit: parseInt(limit),
      status,
      userId
    });
    res.json({
      success: true,
      data: transactions,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting transactions:', error);
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
    service: 'transaction-service',
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
    service: 'transaction-service',
    timestamp: new Date().toISOString(),
    database: connectionPool.getStats(),
    dualWriter: dualWriter.getStats()
  });
});

// Initialize service
async function initializeService() {
  try {
    await connectionPool.initialize();
    await kafkaService.initialize();
    await transactionService.initialize();
    
    logger.info(`Transaction Service started on port ${PORT}`);
  } catch (error) {
    logger.error('Failed to initialize Transaction Service:', error);
    process.exit(1);
  }
}

app.listen(PORT, () => {
  initializeService();
});

export default app;