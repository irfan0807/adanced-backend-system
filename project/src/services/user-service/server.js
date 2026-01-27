import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import jwt from 'jsonwebtoken';
import winston from 'winston';
import DatabaseConnectionPool from '../../shared/database/connection-pool.js';
import DualDatabaseWriter from '../../shared/database/dual-writer.js';
import EventStore from '../../shared/event-sourcing/event-store.js';
import { KafkaService } from '../../shared/messaging/kafka-service.js';
import { UserService } from './user-service.js';

const app = express();
const PORT = process.env.USER_SERVICE_PORT || 3001;

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/user-service.log' })
  ]
});

// Initialize dependencies
const connectionPool = new DatabaseConnectionPool();
const kafkaService = new KafkaService();
const dualWriter = new DualDatabaseWriter(connectionPool);
const eventStore = new EventStore(connectionPool, kafkaService);

const dependencies = {
  connectionPool,
  dualWriter,
  eventStore,
  kafkaService,
  logger
};

// Initialize UserService
const userService = new UserService(dependencies);

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));

// JWT middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'default-secret', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Routes

// Authentication routes
app.post('/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, phoneNumber, dateOfBirth, address, preferences } = req.body;

    // Validate input
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    const result = await userService.createUser({
      email,
      password,
      firstName,
      lastName,
      phoneNumber,
      dateOfBirth,
      address,
      preferences,
      metadata: { source: 'api' }
    });

    res.status(201).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error registering user:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password required'
      });
    }

    const result = await userService.authenticateUser(email, password);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error logging in user:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// User profile routes
app.get('/profile', authenticateToken, async (req, res) => {
  try {
    const result = await userService.getUserProfile(req.user.userId);

    res.json({
      success: true,
      data: result.profile,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting user profile:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { firstName, lastName, phoneNumber, dateOfBirth, address } = req.body;

    const result = await userService.updateProfile(req.user.userId, {
      firstName,
      lastName,
      phoneNumber,
      dateOfBirth,
      address
    }, req.user.userId);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error updating user profile:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check
app.get('/health', async (req, res) => {
  try {
    const health = await userService.healthCheck();
    res.json({
      ...health,
      service: 'user-service',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(500).json({
      status: 'unhealthy',
      service: 'user-service',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Initialize service
async function initializeService() {
  try {
    await connectionPool.initialize();
    await kafkaService.initialize();
    await eventStore.initialize();

    logger.info(`User Service started on port ${PORT}`);
  } catch (error) {
    logger.error('Failed to initialize User Service:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  await userService.cleanup();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  await userService.cleanup();
  process.exit(0);
});

app.listen(PORT, () => {
  initializeService();
});

export default app;
