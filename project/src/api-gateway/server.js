import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
// import rateLimit from 'express-rate-limit';
import RateLimiter from '../shared/patterns/rate-limiter.js';
import CircuitBreaker from '../shared/patterns/circuit-breaker.js';
import Bulkhead from '../shared/patterns/bulkhead.js';
import winston from 'winston';

const app = express();
const PORT = process.env.API_GATEWAY_PORT || 3000;

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/api-gateway.log' })
  ]
});

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const rateLimiter = new RateLimiter({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
  maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100
});

// Bulkhead for different service types
const bulkhead = new Bulkhead({
  defaultPoolSize: 10
});

// Circuit breakers for each service
const serviceBreakers = {
  user: new CircuitBreaker({ timeout: 30000, errorThreshold: 50 }),
  account: new CircuitBreaker({ timeout: 30000, errorThreshold: 50 }),
  transaction: new CircuitBreaker({ timeout: 30000, errorThreshold: 50 }),
  payment: new CircuitBreaker({ timeout: 30000, errorThreshold: 50 }),
  notification: new CircuitBreaker({ timeout: 30000, errorThreshold: 50 }),
  audit: new CircuitBreaker({ timeout: 30000, errorThreshold: 50 }),
  analytics: new CircuitBreaker({ timeout: 30000, errorThreshold: 50 }),
  risk: new CircuitBreaker({ timeout: 30000, errorThreshold: 50 }),
  currency: new CircuitBreaker({ timeout: 30000, errorThreshold: 50 }),
  settlement: new CircuitBreaker({ timeout: 30000, errorThreshold: 50 }),
  reporting: new CircuitBreaker({ timeout: 30000, errorThreshold: 50 }),
  eventstore: new CircuitBreaker({ timeout: 30000, errorThreshold: 50 })
};

// Service registry
const services = {
  user: `http://localhost:${process.env.USER_SERVICE_PORT || 3001}`,
  account: `http://localhost:${process.env.ACCOUNT_SERVICE_PORT || 3002}`,
  transaction: `http://localhost:${process.env.TRANSACTION_SERVICE_PORT || 3003}`,
  payment: `http://localhost:${process.env.PAYMENT_SERVICE_PORT || 3004}`,
  notification: `http://localhost:${process.env.NOTIFICATION_SERVICE_PORT || 3005}`,
  audit: `http://localhost:${process.env.AUDIT_SERVICE_PORT || 3006}`,
  analytics: `http://localhost:${process.env.ANALYTICS_SERVICE_PORT || 3007}`,
  risk: `http://localhost:${process.env.RISK_SERVICE_PORT || 3008}`,
  currency: `http://localhost:${process.env.CURRENCY_SERVICE_PORT || 3009}`,
  settlement: `http://localhost:${process.env.SETTLEMENT_SERVICE_PORT || 3010}`,
  reporting: `http://localhost:${process.env.REPORTING_SERVICE_PORT || 3011}`,
  eventstore: `http://localhost:${process.env.EVENTSTORE_SERVICE_PORT || 3012}`
};

// Rate limiting middleware
const applyRateLimit = async (req, res, next) => {
  const clientId = req.ip || 'anonymous';
  const result = await rateLimiter.slidingWindowLog(clientId, 1);
  
  if (!result.allowed) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      resetTime: result.resetTime,
      remaining: result.remaining
    });
  }

  res.set({
    'X-RateLimit-Remaining': result.remaining,
    'X-RateLimit-Reset': new Date(result.resetTime).toISOString()
  });

  next();
};

// Bulkhead middleware
const applyBulkhead = (poolName) => {
  return async (req, res, next) => {
    try {
      await bulkhead.execute(poolName, async () => {
        return new Promise((resolve) => {
          next();
          resolve();
        });
      });
    } catch (error) {
      logger.error(`Bulkhead rejection for pool ${poolName}:`, error);
      res.status(503).json({
        error: 'Service temporarily unavailable',
        message: 'Too many concurrent requests'
      });
    }
  };
};

// Create proxy middleware with circuit breaker
const createServiceProxy = (serviceName, target) => {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite: {
      [`^/api/${serviceName}`]: ''
    },
    onProxyReq: (proxyReq, req, res) => {
      logger.info(`Proxying request to ${serviceName}:`, {
        method: req.method,
        url: req.url,
        target
      });
    },
    onProxyRes: (proxyRes, req, res) => {
      // Add service name to response headers
      proxyRes.headers['X-Service'] = serviceName;
    },
    onError: (err, req, res) => {
      logger.error(`Proxy error for ${serviceName}:`, err);
      serviceBreakers[serviceName].onFailure();
      
      res.status(503).json({
        error: 'Service unavailable',
        service: serviceName,
        message: 'The requested service is currently unavailable'
      });
    }
  });
};

// Apply middleware to all routes
app.use(applyRateLimit);

// Setup service routes with bulkhead and circuit breaker
Object.entries(services).forEach(([serviceName, target]) => {
  const poolName = `${serviceName}-pool`;
  bulkhead.createPool(poolName, 15); // Create pool for each service
  
  app.use(
    `/api/${serviceName}`,
    applyBulkhead(poolName),
    createServiceProxy(serviceName, target)
  );
});

// Health check endpoint
app.get('/health', (req, res) => {
  const circuitBreakerStates = {};
  Object.entries(serviceBreakers).forEach(([service, breaker]) => {
    circuitBreakerStates[service] = breaker.getState();
  });

  const bulkheadStats = bulkhead.getAllStats();

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: Object.keys(services),
    circuitBreakers: circuitBreakerStates,
    bulkheadStats
  });
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
  const metrics = {
    timestamp: new Date().toISOString(),
    circuitBreakers: {},
    bulkhead: bulkhead.getAllStats(),
    services: Object.keys(services).length
  };

  Object.entries(serviceBreakers).forEach(([service, breaker]) => {
    metrics.circuitBreakers[service] = breaker.getState();
  });

  res.json(metrics);
});

// Service discovery endpoint
app.get('/api/discovery/services', (req, res) => {
  res.json({
    services: Object.keys(services),
    registry: services,
    timestamp: new Date().toISOString()
  });
});

// Fallback route for unmatched paths
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: 'The requested endpoint does not exist',
    availableServices: Object.keys(services)
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: 'An unexpected error occurred'
  });
});

app.listen(PORT, () => {
  logger.info(`API Gateway running on port ${PORT}`);
  logger.info('Registered services:', Object.keys(services));
});

export default app;