import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import DatabaseConnectionPool from '../../shared/database/connection-pool.js';
import DualDatabaseWriter from '../../shared/database/dual-writer.js';
import { KafkaService } from '../../shared/messaging/kafka-service.js';
import winston from 'winston';

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

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Routes
app.post('/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, phoneNumber } = req.body;

    // Validate input
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    // Check if user exists
    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'User already exists'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = {
      id: uuidv4(),
      email,
      password: hashedPassword,
      firstName,
      lastName,
      phoneNumber,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Write to databases
    await dualWriter.writeToAllDatabases(user);

    // Publish user created event
    await kafkaService.produce('user-events', {
      key: user.id,
      value: JSON.stringify({
        eventType: 'USER_CREATED',
        userId: user.id,
        email: user.email,
        timestamp: new Date().toISOString()
      })
    });

    // Remove password from response
    const { password: _, ...userResponse } = user;

    res.status(201).json({
      success: true,
      data: userResponse,
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

    // Get user
    const user = await getUserByEmail(email);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Check user status
    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        error: 'Account is suspended'
      });
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    // Update last login
    await updateUserLastLogin(user.id);

    // Publish login event
    await kafkaService.produce('user-events', {
      key: user.id,
      value: JSON.stringify({
        eventType: 'USER_LOGIN',
        userId: user.id,
        timestamp: new Date().toISOString()
      })
    });

    const { password: _, ...userResponse } = user;

    res.json({
      success: true,
      data: {
        user: userResponse,
        token
      },
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

app.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await getUserById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const { password: _, ...userResponse } = user;

    res.json({
      success: true,
      data: userResponse,
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
    const { firstName, lastName, phoneNumber } = req.body;
    const userId = req.user.userId;

    const updatedUser = await updateUser(userId, {
      firstName,
      lastName,
      phoneNumber,
      updatedAt: new Date().toISOString()
    });

    // Publish user updated event
    await kafkaService.produce('user-events', {
      key: userId,
      value: JSON.stringify({
        eventType: 'USER_UPDATED',
        userId,
        timestamp: new Date().toISOString()
      })
    });

    const { password: _, ...userResponse } = updatedUser;

    res.json({
      success: true,
      data: userResponse,
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
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'user-service',
    timestamp: new Date().toISOString()
  });
});

// Helper functions
async function getUserByEmail(email) {
  try {
    const db = connectionPool.getMongoDatabase();
    return await db.collection('users').findOne({ email });
  } catch (error) {
    // Fallback to MySQL
    return await connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT * FROM users WHERE email = ?',
        [email]
      );
      return rows[0] || null;
    });
  }
}

async function getUserById(id) {
  try {
    const db = connectionPool.getMongoDatabase();
    return await db.collection('users').findOne({ id });
  } catch (error) {
    // Fallback to MySQL
    return await connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT * FROM users WHERE id = ?',
        [id]
      );
      return rows[0] || null;
    });
  }
}

async function updateUser(id, updates) {
  const userData = { id, ...updates };
  await dualWriter.writeToAllDatabases(userData);
  return await getUserById(id);
}

async function updateUserLastLogin(userId) {
  const lastLogin = new Date().toISOString();
  await dualWriter.writeToAllDatabases({ 
    id: userId, 
    lastLogin,
    updatedAt: lastLogin
  });
}

// Initialize service
async function initializeService() {
  try {
    await connectionPool.initialize();
    await kafkaService.initialize();
    
    logger.info(`User Service started on port ${PORT}`);
  } catch (error) {
    logger.error('Failed to initialize User Service:', error);
    process.exit(1);
  }
}

app.listen(PORT, () => {
  initializeService();
});

export default app;