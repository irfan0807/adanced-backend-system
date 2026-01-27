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
import { PaymentService } from './payment-service.js';
import winston from 'winston';

const app = express();
const PORT = process.env.PAYMENT_SERVICE_PORT || 3004;

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/payment-service.log' })
  ]
});

// Initialize dependencies
const connectionPool = new DatabaseConnectionPool();
const kafkaService = new KafkaService();
const dualWriter = new DualDatabaseWriter(connectionPool);
const eventStore = new EventStore(connectionPool, kafkaService);
const commandBus = new CommandBus();
const queryBus = new QueryBus();

// Initialize Payment Service
const paymentService = new PaymentService({
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

// Payment Routes
app.post('/payments', async (req, res) => {
  try {
    const {
      customerId,
      amount,
      currency,
      paymentMethod,
      paymentMethodId,
      description,
      metadata
    } = req.body;

    if (!customerId || !amount || !currency) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: customerId, amount, currency',
        timestamp: new Date().toISOString()
      });
    }

    const result = await paymentService.processPayment({
      customerId,
      amount: parseFloat(amount),
      currency,
      paymentMethod,
      paymentMethodId,
      description,
      metadata
    });

    res.status(201).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error processing payment:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/payments/:id/capture', async (req, res) => {
  try {
    const { amount } = req.body;

    const result = await paymentService.capturePayment(
      req.params.id,
      amount ? parseFloat(amount) : null
    );

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error capturing payment:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/payments/:id/refund', async (req, res) => {
  try {
    const { amount, reason } = req.body;

    if (!amount) {
      return res.status(400).json({
        success: false,
        error: 'Refund amount is required',
        timestamp: new Date().toISOString()
      });
    }

    const result = await paymentService.refundPayment(
      req.params.id,
      parseFloat(amount),
      reason
    );

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error processing refund:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.put('/payments/:id/status', async (req, res) => {
  try {
    const { status, failureReason, gatewayResponse } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'Status is required',
        timestamp: new Date().toISOString()
      });
    }

    const result = await paymentService.updatePaymentStatus(
      req.params.id,
      status,
      { failureReason, gatewayResponse }
    );

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error updating payment status:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/payments/:id', async (req, res) => {
  try {
    const result = await paymentService.getPayment(req.params.id);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found',
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting payment:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/payments', async (req, res) => {
  try {
    const {
      customerId,
      status,
      paymentMethod,
      startDate,
      endDate,
      limit = 50,
      offset = 0
    } = req.query;

    const criteria = {
      customerId,
      status,
      paymentMethod,
      startDate,
      endDate,
      limit: parseInt(limit),
      offset: parseInt(offset)
    };

    const result = await paymentService.getPayments(criteria);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting payments:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Payment Methods Routes
app.post('/payment-methods', async (req, res) => {
  try {
    const {
      customerId,
      type,
      cardNumber,
      expiryMonth,
      expiryYear,
      cvv,
      holderName,
      billingAddress
    } = req.body;

    if (!customerId || !type) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: customerId, type',
        timestamp: new Date().toISOString()
      });
    }

    const result = await paymentService.addPaymentMethod({
      customerId,
      type,
      cardNumber,
      expiryMonth,
      expiryYear,
      cvv,
      holderName,
      billingAddress
    });

    res.status(201).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error adding payment method:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/payment-methods', async (req, res) => {
  try {
    const { customerId, type, isDefault } = req.query;

    const criteria = {
      customerId,
      type,
      isDefault: isDefault === 'true'
    };

    const result = await paymentService.getPaymentMethods(criteria);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting payment methods:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Subscription Routes
app.post('/subscriptions', async (req, res) => {
  try {
    const {
      customerId,
      paymentMethodId,
      amount,
      currency,
      interval,
      intervalCount,
      description,
      metadata
    } = req.body;

    if (!customerId || !paymentMethodId || !amount || !currency || !interval) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: customerId, paymentMethodId, amount, currency, interval',
        timestamp: new Date().toISOString()
      });
    }

    const result = await paymentService.createSubscription({
      customerId,
      paymentMethodId,
      amount: parseFloat(amount),
      currency,
      interval,
      intervalCount: intervalCount || 1,
      description,
      metadata
    });

    res.status(201).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error creating subscription:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/subscriptions', async (req, res) => {
  try {
    const {
      customerId,
      status,
      startDate,
      endDate,
      limit = 50,
      offset = 0
    } = req.query;

    const criteria = {
      customerId,
      status,
      startDate,
      endDate,
      limit: parseInt(limit),
      offset: parseInt(offset)
    };

    const result = await paymentService.getSubscriptions(criteria);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting subscriptions:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Analytics and Reporting Routes
app.get('/analytics/payments', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      groupBy = 'day',
      customerId,
      paymentMethod
    } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required',
        timestamp: new Date().toISOString()
      });
    }

    const criteria = {
      startDate,
      endDate,
      groupBy,
      customerId,
      paymentMethod
    };

    const result = await paymentService.getPaymentStatistics(criteria);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting payment analytics:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/analytics/refunds', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      customerId,
      limit = 50,
      offset = 0
    } = req.query;

    const criteria = {
      startDate,
      endDate,
      customerId,
      limit: parseInt(limit),
      offset: parseInt(offset)
    };

    const result = await paymentService.getRefunds(criteria);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting refunds:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/analytics/disputes', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      status,
      limit = 50,
      offset = 0
    } = req.query;

    const criteria = {
      startDate,
      endDate,
      status,
      limit: parseInt(limit),
      offset: parseInt(offset)
    };

    const result = await paymentService.getDisputes(criteria);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting disputes:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/analytics/fraud-alerts', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      severity,
      resolved,
      limit = 50,
      offset = 0
    } = req.query;

    const criteria = {
      startDate,
      endDate,
      severity,
      resolved: resolved === 'true',
      limit: parseInt(limit),
      offset: parseInt(offset)
    };

    const result = await paymentService.getFraudAlerts(criteria);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting fraud alerts:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Webhook endpoints for payment gateways
app.post('/webhooks/stripe', async (req, res) => {
  try {
    // Handle Stripe webhook
    const event = req.body;

    // Process webhook event
    await paymentService.handleWebhookEvent('stripe', event);

    res.json({ received: true });
  } catch (error) {
    logger.error('Error handling Stripe webhook:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

app.post('/webhooks/paypal', async (req, res) => {
  try {
    // Handle PayPal webhook
    const event = req.body;

    // Process webhook event
    await paymentService.handleWebhookEvent('paypal', event);

    res.json({ received: true });
  } catch (error) {
    logger.error('Error handling PayPal webhook:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Utility Routes
app.post('/convert-currency', async (req, res) => {
  try {
    const { amount, fromCurrency, toCurrency } = req.body;

    if (!amount || !fromCurrency || !toCurrency) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: amount, fromCurrency, toCurrency',
        timestamp: new Date().toISOString()
      });
    }

    const convertedAmount = await paymentService.convertCurrency(
      parseFloat(amount),
      fromCurrency,
      toCurrency
    );

    res.json({
      success: true,
      data: {
        originalAmount: amount,
        convertedAmount,
        fromCurrency,
        toCurrency,
        exchangeRate: convertedAmount / amount
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error converting currency:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/validate-card', async (req, res) => {
  try {
    const { cardNumber } = req.body;

    if (!cardNumber) {
      return res.status(400).json({
        success: false,
        error: 'Card number is required',
        timestamp: new Date().toISOString()
      });
    }

    const isValid = paymentService.validateCardNumber(cardNumber);

    res.json({
      success: true,
      data: {
        isValid,
        maskedNumber: paymentService.maskCardNumber(cardNumber)
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error validating card:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Report Generation
app.get('/reports/payments', async (req, res) => {
  try {
    const { startDate, endDate, groupBy = 'day' } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required',
        timestamp: new Date().toISOString()
      });
    }

    const report = await paymentService.generatePaymentReport(
      startDate,
      endDate,
      groupBy
    );

    res.json({
      success: true,
      data: report,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error generating payment report:', error);
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
    service: 'payment-service',
    timestamp: new Date().toISOString(),
    dependencies: {
      database: connectionPool.getStats(),
      dualWriter: dualWriter.getStats(),
      kafka: kafkaService.getStats(),
      eventStore: eventStore.getStats()
    }
  });
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
  res.json({
    service: 'payment-service',
    timestamp: new Date().toISOString(),
    database: connectionPool.getStats(),
    dualWriter: dualWriter.getStats(),
    kafka: kafkaService.getStats(),
    eventStore: eventStore.getStats(),
    cqrs: {
      commandsProcessed: commandBus.getProcessedCount(),
      queriesProcessed: queryBus.getProcessedCount()
    }
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    timestamp: new Date().toISOString()
  });
});

// Initialize service
async function initializeService() {
  try {
    await connectionPool.initialize();
    await kafkaService.initialize();
    await paymentService.initialize();

    logger.info(`Payment Service started on port ${PORT}`);
  } catch (error) {
    logger.error('Failed to initialize Payment Service:', error);
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