import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { v4 as uuidv4 } from 'uuid';
import DatabaseConnectionPool from '../../shared/database/connection-pool.js';
import DualDatabaseWriter from '../../shared/database/dual-writer.js';
import { KafkaService } from '../../shared/messaging/kafka-service.js';
import winston from 'winston';
import nodeCron from 'node-cron';

const app = express();
const PORT = process.env.CURRENCY_SERVICE_PORT || 3009;

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/currency-service.log' })
  ]
});

// Initialize dependencies
const connectionPool = new DatabaseConnectionPool();
const kafkaService = new KafkaService();
const dualWriter = new DualDatabaseWriter(connectionPool);

// In-memory cache for exchange rates
const exchangeRateCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));

// Routes
app.get('/exchange-rates', async (req, res) => {
  try {
    const { base = 'USD', symbols } = req.query;

    // Get exchange rates logic here
    const rates = await getExchangeRates(base, symbols ? symbols.split(',') : null);

    res.json({
      success: true,
      data: {
        base,
        rates,
        timestamp: new Date().toISOString()
      },
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

app.post('/convert', async (req, res) => {
  try {
    const { from, to, amount } = req.body;

    if (!from || !to || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: from, to, amount',
        timestamp: new Date().toISOString()
      });
    }

    // Convert currency logic here
    const conversion = await convertCurrency(from, to, parseFloat(amount));

    res.json({
      success: true,
      data: conversion,
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

app.get('/currencies', async (req, res) => {
  try {
    // Get supported currencies logic here
    const currencies = await getSupportedCurrencies();

    res.json({
      success: true,
      data: currencies,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting supported currencies:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/exchange-rates/update', async (req, res) => {
  try {
    const { base, rates } = req.body;

    // Update exchange rates logic here
    await updateExchangeRates(base, rates);

    // Publish rates updated event
    await kafkaService.produce('currency-events', {
      eventType: 'EXCHANGE_RATES_UPDATED',
      base,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Exchange rates updated successfully',
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

app.get('/historical-rates', async (req, res) => {
  try {
    const { base, symbols, startDate, endDate } = req.query;

    // Get historical rates logic here
    const historicalRates = await getHistoricalRates(base, symbols, startDate, endDate);

    res.json({
      success: true,
      data: historicalRates,
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

// Advanced currency functionality
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
      const { from, to, amount, id } = conv;
      try {
        const result = await convertCurrency(from, to, parseFloat(amount));
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

app.get('/rates/trends', async (req, res) => {
  try {
    const { base, target, days = 30 } = req.query;

    const trends = await getCurrencyTrends(base, target, parseInt(days));

    res.json({
      success: true,
      data: trends,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting currency trends:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/arbitrage', async (req, res) => {
  try {
    const { base = 'USD', amount = 1000 } = req.query;

    const opportunities = await detectArbitrageOpportunities(base, parseFloat(amount));

    res.json({
      success: true,
      data: opportunities,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error detecting arbitrage:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/alerts/rates', async (req, res) => {
  try {
    const { base, target, threshold, direction, webhookUrl } = req.body;

    const alert = await createRateAlert({
      base,
      target,
      threshold: parseFloat(threshold),
      direction, // 'above' or 'below'
      webhookUrl
    });

    res.status(201).json({
      success: true,
      data: alert,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error creating rate alert:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/alerts/rates', async (req, res) => {
  try {
    const alerts = await getRateAlerts();

    res.json({
      success: true,
      data: alerts,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting rate alerts:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/conversions/history', async (req, res) => {
  try {
    const { userId, page = 1, limit = 20, startDate, endDate } = req.query;

    const history = await getConversionHistory({
      userId,
      page: parseInt(page),
      limit: parseInt(limit),
      startDate,
      endDate
    });

    res.json({
      success: true,
      data: history,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting conversion history:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/conversions', async (req, res) => {
  try {
    const { userId, from, to, amount, purpose } = req.body;

    const conversion = await recordConversion({
      userId,
      from,
      to,
      amount: parseFloat(amount),
      purpose
    });

    res.status(201).json({
      success: true,
      data: conversion,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error recording conversion:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/market-data', async (req, res) => {
  try {
    const { symbols } = req.query;

    const marketData = await getMarketData(symbols ? symbols.split(',') : null);

    res.json({
      success: true,
      data: marketData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting market data:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/rates/validate', async (req, res) => {
  try {
    const { base, rates } = req.body;

    const validation = await validateExchangeRates(base, rates);

    res.json({
      success: true,
      data: validation,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error validating rates:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/exposure', async (req, res) => {
  try {
    const { userId, base = 'USD' } = req.query;

    const exposure = await calculateCurrencyExposure(userId, base);

    res.json({
      success: true,
      data: exposure,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error calculating exposure:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/hedge', async (req, res) => {
  try {
    const { userId, from, to, amount, hedgeType } = req.body;

    const hedge = await createHedgePosition({
      userId,
      from,
      to,
      amount: parseFloat(amount),
      hedgeType
    });

    res.status(201).json({
      success: true,
      data: hedge,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error creating hedge:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/hedges', async (req, res) => {
  try {
    const { userId, status = 'active' } = req.query;

    const hedges = await getHedgePositions(userId, status);

    res.json({
      success: true,
      data: hedges,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting hedge positions:', error);
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
    service: 'currency-service',
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
    service: 'currency-service',
    timestamp: new Date().toISOString(),
    database: connectionPool.getStats(),
    dualWriter: dualWriter.getStats(),
    cacheSize: exchangeRateCache.size,
    activeAlerts: global.rateAlerts ? global.rateAlerts.filter(a => a.active).length : 0,
    totalConversions: 0, // Would need to query database
    supportedCurrencies: 10, // Hardcoded for now
    lastRateUpdate: new Date().toISOString(), // Would track actual last update
    uptime: process.uptime()
  });
});

// Helper functions
async function getExchangeRates(base, symbols) {
  const cacheKey = `${base}_${symbols ? symbols.join(',') : 'all'}`;
  const cached = exchangeRateCache.get(cacheKey);

  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
    return cached.rates;
  }

  try {
    // Try to fetch from external API first
    const rates = await fetchExchangeRatesFromAPI(base);

    // Cache the rates
    exchangeRateCache.set(cacheKey, {
      rates: symbols ? Object.fromEntries(Object.entries(rates).filter(([key]) => symbols.includes(key))) : rates,
      timestamp: Date.now()
    });

    return exchangeRateCache.get(cacheKey).rates;
  } catch (error) {
    logger.warn('Failed to fetch rates from external API, using fallback:', error.message);

    // Fallback to database or cached rates
    const fallbackRates = await getExchangeRatesFromDatabase(base);
    if (fallbackRates) {
      exchangeRateCache.set(cacheKey, {
        rates: symbols ? Object.fromEntries(Object.entries(fallbackRates).filter(([key]) => symbols.includes(key))) : fallbackRates,
        timestamp: Date.now()
      });
      return exchangeRateCache.get(cacheKey).rates;
    }

    // Last resort: hardcoded fallback rates
    const fallbackRates_hardcoded = {
      USD: 1,
      EUR: 0.85,
      GBP: 0.73,
      JPY: 110.0,
      CAD: 1.25,
      AUD: 1.35,
      CHF: 0.92,
      CNY: 6.45,
      INR: 74.5,
      BRL: 5.2
    };

    exchangeRateCache.set(cacheKey, {
      rates: symbols ? Object.fromEntries(Object.entries(fallbackRates_hardcoded).filter(([key]) => symbols.includes(key))) : fallbackRates_hardcoded,
      timestamp: Date.now()
    });

    return exchangeRateCache.get(cacheKey).rates;
  }
}

async function convertCurrency(from, to, amount) {
  const rates = await getExchangeRates(from);
  const rate = rates[to];

  if (!rate) {
    throw new Error(`Exchange rate not available for ${from} to ${to}`);
  }

  const convertedAmount = parseFloat(amount) * parseFloat(rate);

  return {
    from,
    to,
    amount: parseFloat(amount),
    convertedAmount: parseFloat(convertedAmount.toFixed(2)),
    rate: parseFloat(rate),
    timestamp: new Date().toISOString()
  };
}

async function getSupportedCurrencies() {
  try {
    // Try to get from database first
    const dbCurrencies = await getSupportedCurrenciesFromDatabase();
    if (dbCurrencies && dbCurrencies.length > 0) {
      return dbCurrencies;
    }

    // Fallback to hardcoded list
    return [
      { code: 'USD', name: 'US Dollar', symbol: '$' },
      { code: 'EUR', name: 'Euro', symbol: '€' },
      { code: 'GBP', name: 'British Pound', symbol: '£' },
      { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
      { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
      { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
      { code: 'CHF', name: 'Swiss Franc', symbol: 'Fr' },
      { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
      { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
      { code: 'BRL', name: 'Brazilian Real', symbol: 'R$' }
    ];
  } catch (error) {
    logger.error('Error getting supported currencies:', error);
    throw error;
  }
}

async function updateExchangeRates(base, rates) {
  try {
    // Store in database
    await storeExchangeRatesInDatabase(base, rates);

    // Update cache
    const cacheKey = `${base}_all`;
    exchangeRateCache.set(cacheKey, {
      rates,
      timestamp: Date.now()
    });

    logger.info(`Exchange rates updated for base currency: ${base}`);
  } catch (error) {
    logger.error('Error updating exchange rates:', error);
    throw error;
  }
}

async function getHistoricalRates(base, symbols, startDate, endDate) {
  try {
    // Get historical rates from database
    const historicalRates = await getHistoricalRatesFromDatabase(base, symbols, startDate, endDate);

    if (historicalRates && historicalRates.length > 0) {
      return historicalRates;
    }

    // If no historical data, return current rates with date
    const currentRates = await getExchangeRates(base, symbols);
    return [{
      date: new Date().toISOString().split('T')[0],
      base,
      rates: currentRates
    }];
  } catch (error) {
    logger.error('Error getting historical rates:', error);
    throw error;
  }
}

// External API integration
async function fetchExchangeRatesFromAPI(base) {
  // In real implementation, integrate with services like:
  // - Fixer.io
  // - CurrencyAPI.com
  // - Open Exchange Rates
  // - European Central Bank

  // Example implementation for Fixer.io
  const apiKey = process.env.FIXER_API_KEY;
  if (!apiKey) {
    throw new Error('Exchange rate API key not configured');
  }

  const response = await fetch(`http://data.fixer.io/api/latest?access_key=${apiKey}&base=${base}`);
  const data = await response.json();

  if (!data.success) {
    throw new Error(`API Error: ${data.error?.info || 'Unknown error'}`);
  }

  return data.rates;
}

// Database operations
async function getExchangeRatesFromDatabase(base) {
  try {
    const mysqlResult = await connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT rates FROM exchange_rates WHERE base_currency = ? AND updated_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR) ORDER BY updated_at DESC LIMIT 1',
        [base]
      );
      return rows[0];
    });

    if (mysqlResult) {
      return JSON.parse(mysqlResult.rates);
    }

    // Fallback to MongoDB
    const mongoDB = connectionPool.getMongoDatabase();
    const mongoResult = await mongoDB.collection('exchange_rates')
      .findOne({
        baseCurrency: base,
        updatedAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) } // Last hour
      });

    return mongoResult ? mongoResult.rates : null;
  } catch (error) {
    logger.error('Error getting exchange rates from database:', error);
    return null;
  }
}

async function storeExchangeRatesInDatabase(base, rates) {
  try {
    const ratesJson = JSON.stringify(rates);

    // Store in MySQL
    await connectionPool.executeWithMySQLConnection(async (connection) => {
      await connection.execute(
        'INSERT INTO exchange_rates (base_currency, rates, updated_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE rates = VALUES(rates), updated_at = NOW()',
        [base, ratesJson]
      );
    });

    // Store in MongoDB
    const mongoDB = connectionPool.getMongoDatabase();
    await mongoDB.collection('exchange_rates').insertOne({
      baseCurrency: base,
      rates,
      updatedAt: new Date()
    });
  } catch (error) {
    logger.error('Error storing exchange rates in database:', error);
    throw error;
  }
}

async function getSupportedCurrenciesFromDatabase() {
  try {
    const mysqlResult = await connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT * FROM supported_currencies ORDER BY code'
      );
      return rows;
    });

    return mysqlResult;
  } catch (error) {
    logger.error('Error getting supported currencies from database:', error);
    return null;
  }
}

async function getHistoricalRatesFromDatabase(base, symbols, startDate, endDate) {
  try {
    const mysqlResult = await connectionPool.executeWithMySQLConnection(async (connection) => {
      let query = 'SELECT date, rates FROM historical_exchange_rates WHERE base_currency = ?';
      const params = [base];

      if (startDate) {
        query += ' AND date >= ?';
        params.push(startDate);
      }

      if (endDate) {
        query += ' AND date <= ?';
        params.push(endDate);
      }

      query += ' ORDER BY date';

      const [rows] = await connection.execute(query, params);
      return rows.map(row => ({
        date: row.date,
        base,
        rates: JSON.parse(row.rates)
      }));
    });

    return mysqlResult;
  } catch (error) {
    logger.error('Error getting historical rates from database:', error);
    return null;
  }
}

// Advanced currency functions
async function getCurrencyTrends(base, target, days) {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const historicalData = await getHistoricalRatesFromDatabase(
      base,
      target ? [target] : null,
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0]
    );

    if (!historicalData || historicalData.length === 0) {
      return {
        base,
        target,
        period: `${days} days`,
        trend: 'insufficient_data',
        message: 'Not enough historical data available'
      };
    }

    // Calculate trend analysis
    const rates = historicalData.map(d => d.rates[target]).filter(r => r);
    const firstRate = rates[0];
    const lastRate = rates[rates.length - 1];
    const change = ((lastRate - firstRate) / firstRate) * 100;
    const volatility = calculateVolatility(rates);

    return {
      base,
      target,
      period: `${days} days`,
      dataPoints: rates.length,
      startRate: firstRate,
      endRate: lastRate,
      changePercent: change,
      trend: change > 0 ? 'upward' : change < 0 ? 'downward' : 'stable',
      volatility: volatility,
      historicalData: historicalData
    };
  } catch (error) {
    logger.error('Error getting currency trends:', error);
    throw error;
  }
}

function calculateVolatility(rates) {
  if (rates.length < 2) return 0;

  const mean = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
  const variance = rates.reduce((sum, rate) => sum + Math.pow(rate - mean, 2), 0) / rates.length;
  return Math.sqrt(variance);
}

async function detectArbitrageOpportunities(base, amount) {
  try {
    const rates = await getExchangeRates(base);

    // Get rates for triangular arbitrage (base -> X -> Y -> base)
    const opportunities = [];
    const currencies = Object.keys(rates);

    for (let i = 0; i < currencies.length; i++) {
      for (let j = 0; j < currencies.length; j++) {
        if (i === j) continue;

        const currency1 = currencies[i];
        const currency2 = currencies[j];

        // Check triangular arbitrage
        const rate1 = rates[currency1];
        const rate2 = rates[currency2];

        if (rate1 && rate2) {
          // Calculate cross rate
          const crossRate = rate1 / rate2;

          // Check if there's a profitable arbitrage
          const profit = (amount / rate1 / rate2) - amount;

          if (Math.abs(profit) > 0.01) { // More than 1 cent profit
            opportunities.push({
              type: 'triangular',
              path: [base, currency1, currency2, base],
              rates: { [`${base}_${currency1}`]: rate1, [`${base}_${currency2}`]: rate2 },
              crossRate,
              profit: Math.abs(profit),
              profitable: profit > 0
            });
          }
        }
      }
    }

    return opportunities.sort((a, b) => b.profit - a.profit);
  } catch (error) {
    logger.error('Error detecting arbitrage:', error);
    throw error;
  }
}

async function createRateAlert(alertConfig) {
  try {
    const alert = {
      id: uuidv4(),
      ...alertConfig,
      createdAt: new Date().toISOString(),
      active: true,
      lastChecked: null,
      triggeredCount: 0
    };

    // Store in database
    await connectionPool.executeWithMySQLConnection(async (connection) => {
      await connection.execute(
        'INSERT INTO rate_alerts (id, base_currency, target_currency, threshold, direction, webhook_url, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [alert.id, alert.base, alert.target, alert.threshold, alert.direction, alert.webhookUrl, alert.active, alert.createdAt]
      );
    });

    // Cache in memory for quick access
    if (!global.rateAlerts) global.rateAlerts = [];
    global.rateAlerts.push(alert);

    return alert;
  } catch (error) {
    logger.error('Error creating rate alert:', error);
    throw error;
  }
}

async function getRateAlerts() {
  try {
    if (global.rateAlerts) {
      return global.rateAlerts;
    }

    const mysqlResult = await connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT * FROM rate_alerts WHERE active = 1 ORDER BY created_at DESC'
      );
      return rows;
    });

    global.rateAlerts = mysqlResult || [];
    return global.rateAlerts;
  } catch (error) {
    logger.error('Error getting rate alerts:', error);
    return [];
  }
}

async function getConversionHistory(filters) {
  try {
    const { userId, page = 1, limit = 20, startDate, endDate } = filters;
    const offset = (page - 1) * limit;

    let whereClause = '';
    let params = [];

    if (userId) {
      whereClause += ' AND user_id = ?';
      params.push(userId);
    }

    if (startDate) {
      whereClause += ' AND created_at >= ?';
      params.push(startDate);
    }

    if (endDate) {
      whereClause += ' AND created_at <= ?';
      params.push(endDate);
    }

    const mysqlResult = await connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT * FROM currency_conversions WHERE 1=1 ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );
      return rows;
    });

    return mysqlResult || [];
  } catch (error) {
    logger.error('Error getting conversion history:', error);
    throw error;
  }
}

async function recordConversion(conversion) {
  try {
    const result = await convertCurrency(conversion.from, conversion.to, conversion.amount);

    const record = {
      id: uuidv4(),
      userId: conversion.userId,
      fromCurrency: conversion.from,
      toCurrency: conversion.to,
      amount: conversion.amount,
      convertedAmount: result.convertedAmount,
      exchangeRate: result.rate,
      purpose: conversion.purpose,
      createdAt: new Date().toISOString()
    };

    // Store in database
    await connectionPool.executeWithMySQLConnection(async (connection) => {
      await connection.execute(
        'INSERT INTO currency_conversions (id, user_id, from_currency, to_currency, amount, converted_amount, exchange_rate, purpose, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [record.id, record.userId, record.fromCurrency, record.toCurrency, record.amount, record.convertedAmount, record.exchangeRate, record.purpose, record.createdAt]
      );
    });

    // Publish conversion event
    await kafkaService.produce('currency-events', {
      eventType: 'CURRENCY_CONVERSION_RECORDED',
      conversionId: record.id,
      userId: record.userId,
      from: record.fromCurrency,
      to: record.toCurrency,
      amount: record.amount,
      convertedAmount: record.convertedAmount,
      timestamp: record.createdAt
    });

    return record;
  } catch (error) {
    logger.error('Error recording conversion:', error);
    throw error;
  }
}

async function getMarketData(symbols) {
  try {
    // In a real implementation, this would fetch from financial data providers
    // For now, return mock market data
    const marketData = {};

    if (!symbols) {
      symbols = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'USDAUD'];
    }

    for (const symbol of symbols) {
      const base = symbol.substring(0, 3);
      const quote = symbol.substring(3, 6);

      try {
        const rates = await getExchangeRates(base, [quote]);
        const rate = rates[quote];

        marketData[symbol] = {
          symbol,
          bid: rate * 0.9995, // Mock spread
          ask: rate * 1.0005,
          last: rate,
          change: (Math.random() - 0.5) * 0.02, // Random change
          volume: Math.floor(Math.random() * 1000000),
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        // Skip symbols that can't be resolved
      }
    }

    return marketData;
  } catch (error) {
    logger.error('Error getting market data:', error);
    throw error;
  }
}

async function validateExchangeRates(base, rates) {
  try {
    const validation = {
      base,
      totalCurrencies: Object.keys(rates).length,
      issues: [],
      recommendations: [],
      score: 100
    };

    // Check for obviously wrong rates (too high or too low)
    const reasonableRanges = {
      USD: { min: 0.5, max: 2.0 },
      EUR: { min: 0.8, max: 1.2 },
      GBP: { min: 0.7, max: 1.4 },
      JPY: { min: 100, max: 160 },
      // Add more as needed
    };

    for (const [currency, rate] of Object.entries(rates)) {
      if (reasonableRanges[currency]) {
        const range = reasonableRanges[currency];
        if (rate < range.min || rate > range.max) {
          validation.issues.push({
            currency,
            issue: 'rate_out_of_reasonable_range',
            currentRate: rate,
            expectedRange: range
          });
          validation.score -= 10;
        }
      }
    }

    // Check for cross-rate consistency
    const usdRates = await getExchangeRates('USD');
    for (const [currency, rate] of Object.entries(rates)) {
      if (usdRates[currency]) {
        const expectedRate = usdRates[currency];
        const difference = Math.abs(rate - expectedRate) / expectedRate;

        if (difference > 0.05) { // 5% difference
          validation.issues.push({
            currency,
            issue: 'inconsistent_with_market_rates',
            providedRate: rate,
            marketRate: expectedRate,
            differencePercent: (difference * 100).toFixed(2)
          });
          validation.score -= 5;
        }
      }
    }

    // Generate recommendations
    if (validation.issues.length > 0) {
      validation.recommendations.push('Consider updating rates from reliable sources');
    }

    if (validation.score < 80) {
      validation.recommendations.push('Rates may be manipulated or outdated');
    }

    validation.valid = validation.score >= 70;

    return validation;
  } catch (error) {
    logger.error('Error validating rates:', error);
    throw error;
  }
}

async function calculateCurrencyExposure(userId, base) {
  try {
    // Get user's accounts and balances
    const mysqlResult = await connectionPool.executeWithMySQLConnection(async (connection) => {
      const [accounts] = await connection.execute(
        'SELECT currency, SUM(balance) as total_balance FROM accounts WHERE user_id = ? GROUP BY currency',
        [userId]
      );

      const [conversions] = await connection.execute(
        'SELECT from_currency, to_currency, SUM(amount) as total_converted FROM currency_conversions WHERE user_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) GROUP BY from_currency, to_currency',
        [userId]
      );

      return { accounts, conversions };
    });

    const exposure = {
      userId,
      baseCurrency: base,
      accountBalances: {},
      conversionActivity: {},
      netExposure: {},
      riskLevel: 'low'
    };

    // Calculate account balances in base currency
    for (const account of mysqlResult.accounts) {
      const rates = await getExchangeRates(base, [account.currency]);
      const rate = rates[account.currency] || 1;
      const baseBalance = account.total_balance / rate;

      exposure.accountBalances[account.currency] = {
        amount: account.total_balance,
        baseEquivalent: baseBalance
      };
    }

    // Analyze conversion patterns
    const conversionMap = {};
    for (const conv of mysqlResult.conversions) {
      const key = `${conv.from_currency}_${conv.to_currency}`;
      conversionMap[key] = (conversionMap[key] || 0) + conv.total_converted;
    }

    exposure.conversionActivity = conversionMap;

    // Calculate net exposure
    const currencies = new Set([...Object.keys(exposure.accountBalances), ...Object.keys(exposure.conversionActivity)]);

    for (const currency of currencies) {
      const balance = exposure.accountBalances[currency]?.baseEquivalent || 0;
      // Simplified exposure calculation
      exposure.netExposure[currency] = balance;
    }

    // Determine risk level
    const exposures = Object.values(exposure.netExposure);
    const maxExposure = Math.max(...exposures);
    const minExposure = Math.min(...exposures);

    if (maxExposure - minExposure > 10000) {
      exposure.riskLevel = 'high';
    } else if (maxExposure - minExposure > 1000) {
      exposure.riskLevel = 'medium';
    }

    return exposure;
  } catch (error) {
    logger.error('Error calculating exposure:', error);
    throw error;
  }
}

async function createHedgePosition(hedge) {
  try {
    const hedgePosition = {
      id: uuidv4(),
      ...hedge,
      status: 'active',
      createdAt: new Date().toISOString(),
      settledAt: null
    };

    // Store in database
    await connectionPool.executeWithMySQLConnection(async (connection) => {
      await connection.execute(
        'INSERT INTO hedge_positions (id, user_id, from_currency, to_currency, amount, hedge_type, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [hedgePosition.id, hedgePosition.userId, hedgePosition.from, hedgePosition.to, hedgePosition.amount, hedgePosition.hedgeType, hedgePosition.status, hedgePosition.createdAt]
      );
    });

    // Publish hedge event
    await kafkaService.produce('currency-events', {
      eventType: 'HEDGE_POSITION_CREATED',
      hedgeId: hedgePosition.id,
      userId: hedgePosition.userId,
      from: hedgePosition.from,
      to: hedgePosition.to,
      amount: hedgePosition.amount,
      hedgeType: hedgePosition.hedgeType,
      timestamp: hedgePosition.createdAt
    });

    return hedgePosition;
  } catch (error) {
    logger.error('Error creating hedge position:', error);
    throw error;
  }
}

// Scheduled tasks
async function scheduleRateUpdates() {
  // Update rates every 5 minutes
  nodeCron.schedule('*/5 * * * *', async () => {
    try {
      logger.info('Scheduled rate update starting...');

      const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF'];
      const updatePromises = currencies.map(async (base) => {
        try {
          const rates = await fetchExchangeRatesFromAPI(base);
          await updateExchangeRates(base, rates);
        } catch (error) {
          logger.warn(`Failed to update rates for ${base}:`, error.message);
        }
      });

      await Promise.allSettled(updatePromises);

      // Check rate alerts
      await checkRateAlerts();

      logger.info('Scheduled rate update completed');
    } catch (error) {
      logger.error('Error in scheduled rate update:', error);
    }
  });
}

async function checkRateAlerts() {
  try {
    const alerts = await getRateAlerts();

    for (const alert of alerts) {
      try {
        const rates = await getExchangeRates(alert.base, [alert.target]);
        const currentRate = rates[alert.target];

        if (!currentRate) continue;

        const shouldTrigger =
          (alert.direction === 'above' && currentRate >= alert.threshold) ||
          (alert.direction === 'below' && currentRate <= alert.threshold);

        if (shouldTrigger) {
          await triggerRateAlert(alert, currentRate);

          alert.triggeredCount++;
          alert.lastTriggered = new Date().toISOString();
        }
      } catch (error) {
        logger.warn(`Error checking alert ${alert.id}:`, error.message);
      }
    }
  } catch (error) {
    logger.error('Error checking rate alerts:', error);
  }
}

async function triggerRateAlert(alert, currentRate) {
  try {
    const alertData = {
      alertId: alert.id,
      base: alert.base,
      target: alert.target,
      threshold: alert.threshold,
      direction: alert.direction,
      currentRate,
      triggeredAt: new Date().toISOString()
    };

    if (alert.webhookUrl) {
      // In a real implementation, send HTTP request to webhook
      logger.info(`Rate alert triggered: ${alert.base}/${alert.target} ${alert.direction} ${alert.threshold}`, alertData);
    }

    // Store alert trigger in database
    await connectionPool.executeWithMySQLConnection(async (connection) => {
      await connection.execute(
        'INSERT INTO rate_alert_triggers (alert_id, current_rate, triggered_at) VALUES (?, ?, ?)',
        [alert.id, currentRate, alertData.triggeredAt]
      );
    });

    // Publish alert event
    await kafkaService.produce('currency-events', {
      eventType: 'RATE_ALERT_TRIGGERED',
      ...alertData
    });

  } catch (error) {
    logger.error('Error triggering rate alert:', error);
  }
}

async function getHedgePositions(userId, status) {
  try {
    let whereClause = 'status = ?';
    let params = [status];

    if (userId) {
      whereClause += ' AND user_id = ?';
      params.push(userId);
    }

    const mysqlResult = await connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT * FROM hedge_positions WHERE ${whereClause} ORDER BY created_at DESC`,
        params
      );
      return rows;
    });

    return mysqlResult || [];
  } catch (error) {
    logger.error('Error getting hedge positions:', error);
    throw error;
  }
}

// Initialize service
async function initializeService() {
  try {
    await connectionPool.initialize();
    await kafkaService.initialize();

    // Start scheduled rate updates
    await scheduleRateUpdates();

    // Load rate alerts into memory
    await getRateAlerts();

    logger.info(`Currency Service started on port ${PORT}`);
  } catch (error) {
    logger.error('Failed to initialize Currency Service:', error);
    process.exit(1);
  }
}

app.listen(PORT, () => {
  initializeService();
});

export default app;