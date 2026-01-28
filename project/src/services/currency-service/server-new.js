import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { v4 as uuidv4 } from 'uuid';
import { CurrencyService } from './currency-service.js';
import winston from 'winston';

const app = express();
const PORT = process.env.CURRENCY_SERVICE_PORT || 3009;

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp,
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/currency-service.log' })
  ]
});

// Initialize Currency Service
const currencyService = new CurrencyService({
  kafka: {
    brokers: process.env.KAFKA_BROKERS?.split(',') || ['localhost:9092'],
    clientId: 'currency-service'
  },
  database: {
    mysql: {
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'currency_db'
    },
    mongodb: {
      url: process.env.MONGODB_URL || 'mongodb://localhost:27017/currency_db'
    }
  },
  eventStore: {
    url: process.env.EVENTSTORE_URL || 'localhost:2113'
  },
  externalApi: {
    fixerApiKey: process.env.FIXER_API_KEY,
    baseUrl: process.env.EXTERNAL_API_URL
  }
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));

// Routes

// Get exchange rates
app.get('/exchange-rates', async (req, res) => {
  try {
    const { base = 'USD', symbols, date } = req.query;

    const currencies = symbols ? symbols.split(',') : null;
    const result = await currencyService.getExchangeRates(base, currencies, date);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting exchange rates:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Convert currency
app.post('/convert', async (req, res) => {
  try {
    const { from, to, amount, userId, purpose } = req.body;

    if (!from || !to || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: from, to, amount',
        timestamp: new Date().toISOString()
      });
    }

    const result = await currencyService.convertCurrency(from, to, parseFloat(amount), userId, purpose);

    res.json({
      success: true,
      data: result,
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

// Get supported currencies
app.get('/currencies', async (req, res) => {
  try {
    const result = await currencyService.getCurrencyList();

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting currencies:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Update exchange rates (admin)
app.post('/exchange-rates/update', async (req, res) => {
  try {
    const { base, rates, source = 'manual', requestedBy = 'system' } = req.body;

    if (!base || !rates) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: base, rates',
        timestamp: new Date().toISOString()
      });
    }

    const result = await currencyService.updateExchangeRates(base, rates, source, requestedBy);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error updating exchange rates:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get historical exchange rates
app.get('/historical-rates', async (req, res) => {
  try {
    const { base, target, startDate, endDate, interval = 'daily' } = req.query;

    if (!base || !target || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: base, target, startDate, endDate',
        timestamp: new Date().toISOString()
      });
    }

    const result = await currencyService.getExchangeRateHistory(base, target, startDate, endDate, interval);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting historical rates:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Bulk currency conversion
app.post('/convert/bulk', async (req, res) => {
  try {
    const { conversions } = req.body;

    if (!Array.isArray(conversions) || conversions.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Conversions array is required',
        timestamp: new Date().toISOString()
      });
    }

    const results = await Promise.all(conversions.map(async (conv) => {
      const { from, to, amount, userId, purpose, id } = conv;
      try {
        const result = await currencyService.convertCurrency(from, to, parseFloat(amount), userId, purpose);
        return { id, ...result, success: true };
      } catch (error) {
        return { id, success: false, error: error.message };
      }
    }));

    res.json({
      success: true,
      data: results,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error performing bulk conversion:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get currency analytics
app.get('/analytics/currency/:currencyCode', async (req, res) => {
  try {
    const { currencyCode } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: startDate, endDate',
        timestamp: new Date().toISOString()
      });
    }

    const result = await currencyService.getCurrencyAnalytics(currencyCode, startDate, endDate);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting currency analytics:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get conversion analytics
app.get('/analytics/conversions', async (req, res) => {
  try {
    const { startDate, endDate, groupBy = 'overall' } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: startDate, endDate',
        timestamp: new Date().toISOString()
      });
    }

    const result = await currencyService.getConversionAnalytics(startDate, endDate, groupBy);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting conversion analytics:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Add new currency (admin)
app.post('/currencies', async (req, res) => {
  try {
    const { currencyCode, currencyName, symbol, decimalPlaces, addedBy } = req.body;

    if (!currencyCode || !currencyName) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: currencyCode, currencyName',
        timestamp: new Date().toISOString()
      });
    }

    const result = await currencyService.addCurrency(
      currencyCode,
      currencyName,
      symbol,
      decimalPlaces,
      addedBy
    );

    res.status(201).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error adding currency:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Update currency settings (admin)
app.put('/currencies/:currencyCode', async (req, res) => {
  try {
    const { currencyCode } = req.params;
    const { updates, updatedBy } = req.body;

    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Updates object is required',
        timestamp: new Date().toISOString()
      });
    }

    const result = await currencyService.updateCurrencySettings(currencyCode, updates, updatedBy);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error updating currency settings:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Remove currency (admin)
app.delete('/currencies/:currencyCode', async (req, res) => {
  try {
    const { currencyCode } = req.params;
    const { removedBy, reason } = req.body;

    const result = await currencyService.removeCurrency(currencyCode, removedBy, reason);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error removing currency:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get base currency
app.get('/base-currency', async (req, res) => {
  try {
    const result = await currencyService.getBaseCurrency();

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting base currency:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Set base currency (admin)
app.put('/base-currency', async (req, res) => {
  try {
    const { currencyCode, setBy } = req.body;

    if (!currencyCode) {
      return res.status(400).json({
        success: false,
        error: 'Currency code is required',
        timestamp: new Date().toISOString()
      });
    }

    const result = await currencyService.setBaseCurrency(currencyCode, setBy);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error setting base currency:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Refresh exchange rates from external API
app.post('/exchange-rates/refresh', async (req, res) => {
  try {
    const { source = 'api', requestedBy = 'system' } = req.body;

    const result = await currencyService.refreshExchangeRates(source, requestedBy);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error refreshing exchange rates:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get currency conversion preview (without recording)
app.post('/convert/preview', async (req, res) => {
  try {
    const { from, to, amount } = req.body;

    if (!from || !to || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: from, to, amount',
        timestamp: new Date().toISOString()
      });
    }

    const result = await currencyService.getCurrencyConversion(from, to, parseFloat(amount));

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting conversion preview:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Health check
app.get('/health', async (req, res) => {
  try {
    const health = await currencyService.getServiceHealth();

    res.json({
      success: true,
      data: health,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting health status:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    const health = await currencyService.getServiceHealth();

    res.json({
      service: 'currency-service',
      status: currencyService.getStatus(),
      health,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting metrics:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
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

// Initialize service and start server
async function initializeService() {
  try {
    await currencyService.initialize();
    await currencyService.subscribeToEvents();

    logger.info(`Currency Service started on port ${PORT}`);
  } catch (error) {
    logger.error('Failed to initialize Currency Service:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  await currencyService.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  await currencyService.shutdown();
  process.exit(0);
});

app.listen(PORT, () => {
  initializeService();
});

export default app;