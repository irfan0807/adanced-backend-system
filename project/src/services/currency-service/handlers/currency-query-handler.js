import {
  GetExchangeRatesQuery,
  GetCurrencyConversionQuery,
  GetCurrencyListQuery,
  GetExchangeRateHistoryQuery,
  GetCurrencyAnalyticsQuery,
  GetConversionAnalyticsQuery,
  GetCurrencySettingsQuery,
  GetBaseCurrencyQuery,
  GetSupportedCurrenciesQuery,
  GetCurrencyServiceHealthQuery,
  GetBulkCurrencyUpdatesQuery,
  GetArchivedCurrencyDataQuery,
  GetSuspiciousCurrencyActivitiesQuery,
  GetCurrencyReportsQuery,
  GetCurrencyRetentionPoliciesQuery,
  GetCurrencyRiskProfilesQuery,
  GetCurrencyComplianceReportsQuery,
  GetCurrencyFraudAlertsQuery,
  GetCurrencyExposureAnalysisQuery
} from '../queries/currency-queries.js';

export class CurrencyQueryHandler {
  constructor(dependencies) {
    this.connectionPool = dependencies.connectionPool;
    this.dualWriter = dependencies.dualWriter;
    this.eventStore = dependencies.eventStore;
    this.logger = dependencies.logger;
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  async handle(query) {
    try {
      query.validate();

      switch (query.constructor.name) {
        case 'GetExchangeRatesQuery':
          return await this.handleGetExchangeRates(query);
        case 'GetCurrencyConversionQuery':
          return await this.handleGetCurrencyConversion(query);
        case 'GetCurrencyListQuery':
          return await this.handleGetCurrencyList(query);
        case 'GetExchangeRateHistoryQuery':
          return await this.handleGetExchangeRateHistory(query);
        case 'GetCurrencyAnalyticsQuery':
          return await this.handleGetCurrencyAnalytics(query);
        case 'GetConversionAnalyticsQuery':
          return await this.handleGetConversionAnalytics(query);
        case 'GetCurrencySettingsQuery':
          return await this.handleGetCurrencySettings(query);
        case 'GetBaseCurrencyQuery':
          return await this.handleGetBaseCurrency(query);
        case 'GetSupportedCurrenciesQuery':
          return await this.handleGetSupportedCurrencies(query);
        case 'GetCurrencyServiceHealthQuery':
          return await this.handleGetCurrencyServiceHealth(query);
        case 'GetBulkCurrencyUpdatesQuery':
          return await this.handleGetBulkCurrencyUpdates(query);
        case 'GetArchivedCurrencyDataQuery':
          return await this.handleGetArchivedCurrencyData(query);
        case 'GetSuspiciousCurrencyActivitiesQuery':
          return await this.handleGetSuspiciousCurrencyActivities(query);
        case 'GetCurrencyReportsQuery':
          return await this.handleGetCurrencyReports(query);
        case 'GetCurrencyRetentionPoliciesQuery':
          return await this.handleGetCurrencyRetentionPolicies(query);
        case 'GetCurrencyRiskProfilesQuery':
          return await this.handleGetCurrencyRiskProfiles(query);
        case 'GetCurrencyComplianceReportsQuery':
          return await this.handleGetCurrencyComplianceReports(query);
        case 'GetCurrencyFraudAlertsQuery':
          return await this.handleGetCurrencyFraudAlerts(query);
        case 'GetCurrencyExposureAnalysisQuery':
          return await this.handleGetCurrencyExposureAnalysis(query);
        default:
          throw new Error(`Unknown query: ${query.constructor.name}`);
      }
    } catch (error) {
      this.logger.error(`Error handling query ${query.constructor.name}:`, error);
      throw error;
    }
  }

  async handleGetExchangeRates(query) {
    const cacheKey = `rates_${query.baseCurrency}_${query.date || 'latest'}`;

    // Check cache first
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    let rates;

    if (query.date) {
      // Get historical rates
      rates = await this.getHistoricalExchangeRates(query.baseCurrency, query.date);
    } else {
      // Get latest rates
      rates = await this.getLatestExchangeRates(query.baseCurrency);
    }

    // Filter by requested currencies if specified
    if (query.currencies && query.currencies.length > 0) {
      const filteredRates = {};
      for (const currency of query.currencies) {
        if (rates[currency] !== undefined) {
          filteredRates[currency] = rates[currency];
        }
      }
      rates = filteredRates;
    }

    const result = {
      baseCurrency: query.baseCurrency,
      rates,
      timestamp: new Date().toISOString(),
      source: 'currency-service'
    };

    // Cache the result
    this.setCache(cacheKey, result);

    return result;
  }

  async handleGetCurrencyConversion(query) {
    const cacheKey = `conversion_${query.fromCurrency}_${query.toCurrency}_${query.amount}`;

    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    // Get current exchange rate
    const exchangeRate = await this.getExchangeRate(query.fromCurrency, query.toCurrency);

    if (!exchangeRate) {
      throw new Error(`Exchange rate not available for ${query.fromCurrency} to ${query.toCurrency}`);
    }

    // Calculate conversion
    const convertedAmount = query.amount * exchangeRate;
    const fee = this.calculateConversionFee(query.amount, query.fromCurrency, query.toCurrency);
    const finalAmount = convertedAmount - fee;

    const result = {
      fromCurrency: query.fromCurrency,
      toCurrency: query.toCurrency,
      amount: query.amount,
      convertedAmount: finalAmount,
      exchangeRate,
      fee,
      timestamp: new Date().toISOString()
    };

    this.setCache(cacheKey, result);

    return result;
  }

  async handleGetCurrencyList(query) {
    const cacheKey = 'currency_list';

    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    const currencies = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT currency_code, currency_name, symbol, decimal_places, is_active FROM currencies WHERE is_active = 1 ORDER BY currency_code'
      );
      return rows;
    });

    const result = {
      currencies: currencies.map(c => ({
        code: c.currency_code,
        name: c.currency_name,
        symbol: c.symbol,
        decimalPlaces: c.decimal_places,
        isActive: c.is_active === 1
      })),
      count: currencies.length,
      timestamp: new Date().toISOString()
    };

    this.setCache(cacheKey, result);

    return result;
  }

  async handleGetExchangeRateHistory(query) {
    const cacheKey = `history_${query.baseCurrency}_${query.startDate}_${query.endDate}_${query.interval}`;

    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    const history = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      let queryStr = `
        SELECT timestamp, rates
        FROM exchange_rates
        WHERE base_currency = ?
        AND timestamp BETWEEN ? AND ?
        ORDER BY timestamp DESC
      `;

      const params = [query.baseCurrency, query.startDate, query.endDate];

      // Apply interval filtering if specified
      if (query.interval) {
        switch (query.interval) {
          case 'hourly':
            queryStr = `
              SELECT DATE_FORMAT(timestamp, '%Y-%m-%d %H:00:00') as period,
                     AVG(CAST(JSON_EXTRACT(rates, '$."${query.targetCurrency}"') AS DECIMAL(20,8))) as rate
              FROM exchange_rates
              WHERE base_currency = ?
              AND timestamp BETWEEN ? AND ?
              GROUP BY period
              ORDER BY period DESC
            `;
            break;
          case 'daily':
            queryStr = `
              SELECT DATE(timestamp) as period,
                     AVG(CAST(JSON_EXTRACT(rates, '$."${query.targetCurrency}"') AS DECIMAL(20,8))) as rate
              FROM exchange_rates
              WHERE base_currency = ?
              AND timestamp BETWEEN ? AND ?
              GROUP BY period
              ORDER BY period DESC
            `;
            break;
          case 'weekly':
            queryStr = `
              SELECT DATE_SUB(DATE(timestamp), INTERVAL WEEKDAY(timestamp) DAY) as period,
                     AVG(CAST(JSON_EXTRACT(rates, '$."${query.targetCurrency}"') AS DECIMAL(20,8))) as rate
              FROM exchange_rates
              WHERE base_currency = ?
              AND timestamp BETWEEN ? AND ?
              GROUP BY period
              ORDER BY period DESC
            `;
            break;
        }
      }

      const [rows] = await connection.execute(queryStr, params);
      return rows;
    });

    const result = {
      baseCurrency: query.baseCurrency,
      targetCurrency: query.targetCurrency,
      interval: query.interval,
      history: history.map(h => ({
        timestamp: h.timestamp || h.period,
        rate: h.rate || JSON.parse(h.rates)[query.targetCurrency]
      })),
      count: history.length,
      timestamp: new Date().toISOString()
    };

    this.setCache(cacheKey, result);

    return result;
  }

  async handleGetCurrencyAnalytics(query) {
    const cacheKey = `analytics_${query.currencyCode}_${query.startDate}_${query.endDate}`;

    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    const analytics = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(`
        SELECT
          COUNT(*) as total_conversions,
          SUM(amount) as total_amount_converted,
          AVG(converted_amount / amount) as avg_exchange_rate,
          MIN(converted_amount / amount) as min_exchange_rate,
          MAX(converted_amount / amount) as max_exchange_rate,
          SUM(fee) as total_fees
        FROM currency_conversions
        WHERE (from_currency = ? OR to_currency = ?)
        AND timestamp BETWEEN ? AND ?
      `, [query.currencyCode, query.currencyCode, query.startDate, query.endDate]);

      return rows[0];
    });

    const result = {
      currencyCode: query.currencyCode,
      period: {
        startDate: query.startDate,
        endDate: query.endDate
      },
      analytics: {
        totalConversions: analytics.total_conversions,
        totalAmountConverted: parseFloat(analytics.total_amount_converted || 0),
        averageExchangeRate: parseFloat(analytics.avg_exchange_rate || 0),
        minExchangeRate: parseFloat(analytics.min_exchange_rate || 0),
        maxExchangeRate: parseFloat(analytics.max_exchange_rate || 0),
        totalFees: parseFloat(analytics.total_fees || 0)
      },
      timestamp: new Date().toISOString()
    };

    this.setCache(cacheKey, result);

    return result;
  }

  async handleGetConversionAnalytics(query) {
    const cacheKey = `conversion_analytics_${query.startDate}_${query.endDate}_${query.groupBy}`;

    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    let analytics;

    switch (query.groupBy) {
      case 'currency_pair':
        analytics = await this.getAnalyticsByCurrencyPair(query.startDate, query.endDate);
        break;
      case 'user':
        analytics = await this.getAnalyticsByUser(query.startDate, query.endDate);
        break;
      case 'daily':
        analytics = await this.getAnalyticsByDay(query.startDate, query.endDate);
        break;
      default:
        analytics = await this.getOverallAnalytics(query.startDate, query.endDate);
    }

    const result = {
      period: {
        startDate: query.startDate,
        endDate: query.endDate
      },
      groupBy: query.groupBy,
      analytics,
      timestamp: new Date().toISOString()
    };

    this.setCache(cacheKey, result);

    return result;
  }

  async handleGetCurrencySettings(query) {
    const settings = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT * FROM currencies WHERE currency_code = ? AND is_active = 1',
        [query.currencyCode]
      );
      return rows.length > 0 ? rows[0] : null;
    });

    if (!settings) {
      throw new Error(`Currency ${query.currencyCode} not found`);
    }

    return {
      currencyCode: settings.currency_code,
      currencyName: settings.currency_name,
      symbol: settings.symbol,
      decimalPlaces: settings.decimal_places,
      isActive: settings.is_active === 1,
      createdAt: settings.created_at,
      updatedAt: settings.updated_at
    };
  }

  async handleGetBaseCurrency(query) {
    const baseCurrency = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT setting_value FROM currency_settings WHERE setting_key = ?',
        ['base_currency']
      );
      return rows.length > 0 ? rows[0].setting_value : 'USD';
    });

    return {
      baseCurrency,
      timestamp: new Date().toISOString()
    };
  }

  async handleGetSupportedCurrencies(query) {
    const currencies = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT currency_code, currency_name, symbol FROM currencies WHERE is_active = 1 ORDER BY currency_code'
      );
      return rows;
    });

    return {
      supportedCurrencies: currencies.map(c => ({
        code: c.currency_code,
        name: c.currency_name,
        symbol: c.symbol
      })),
      count: currencies.length,
      timestamp: new Date().toISOString()
    };
  }

  async handleGetCurrencyServiceHealth(query) {
    const health = {
      service: 'currency-service',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {}
    };

    try {
      // Check database connectivity
      await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        await connection.execute('SELECT 1');
      });
      health.checks.database = { status: 'healthy', message: 'Database connection OK' };
    } catch (error) {
      health.checks.database = { status: 'unhealthy', message: error.message };
      health.status = 'unhealthy';
    }

    try {
      // Check MongoDB connectivity
      await this.dualWriter.checkMongoConnection();
      health.checks.mongodb = { status: 'healthy', message: 'MongoDB connection OK' };
    } catch (error) {
      health.checks.mongodb = { status: 'unhealthy', message: error.message };
      health.status = 'unhealthy';
    }

    try {
      // Check Event Store
      await this.eventStore.checkHealth();
      health.checks.eventStore = { status: 'healthy', message: 'Event Store OK' };
    } catch (error) {
      health.checks.eventStore = { status: 'unhealthy', message: error.message };
      health.status = 'unhealthy';
    }

    // Get service metrics
    health.metrics = await this.getServiceMetrics();

    return health;
  }

  async handleGetBulkCurrencyUpdates(query) {
    let sql = `
      SELECT batch_id, source, total_updates, successful_updates, failed_updates,
             requested_by, created_at
      FROM bulk_currency_updates
      WHERE 1=1
    `;
    const params = [];

    if (query.batchId) {
      sql += ' AND batch_id = ?';
      params.push(query.batchId);
    }

    if (query.source) {
      sql += ' AND source = ?';
      params.push(query.source);
    }

    if (query.requestedBy) {
      sql += ' AND requested_by = ?';
      params.push(query.requestedBy);
    }

    if (query.startDate) {
      sql += ' AND created_at >= ?';
      params.push(query.startDate);
    }

    if (query.endDate) {
      sql += ' AND created_at <= ?';
      params.push(query.endDate);
    }

    if (query.status === 'successful') {
      sql += ' AND failed_updates = 0';
    } else if (query.status === 'failed') {
      sql += ' AND successful_updates = 0';
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(query.limit, (query.page - 1) * query.limit);

    const updates = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(sql, params);
      return rows;
    });

    const total = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute('SELECT COUNT(*) as count FROM bulk_currency_updates', []);
      return rows[0].count;
    });

    return {
      updates: updates.map(update => ({
        batchId: update.batch_id,
        source: update.source,
        totalUpdates: update.total_updates,
        successfulUpdates: update.successful_updates,
        failedUpdates: update.failed_updates,
        requestedBy: update.requested_by,
        createdAt: update.created_at
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit)
      }
    };
  }

  async handleGetArchivedCurrencyData(query) {
    let sql = `
      SELECT id, criteria, archive_to, retention_period_days, records_archived,
             archive_size_bytes, requested_by, reason, status, created_at
      FROM currency_data_archives
      WHERE 1=1
    `;
    const params = [];

    if (query.archiveLocation) {
      sql += ' AND archive_to = ?';
      params.push(query.archiveLocation);
    }

    if (query.requestedBy) {
      sql += ' AND requested_by = ?';
      params.push(query.requestedBy);
    }

    if (query.startDate) {
      sql += ' AND created_at >= ?';
      params.push(query.startDate);
    }

    if (query.endDate) {
      sql += ' AND created_at <= ?';
      params.push(query.endDate);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(query.limit, (query.page - 1) * query.limit);

    const archives = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(sql, params);
      return rows;
    });

    const total = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute('SELECT COUNT(*) as count FROM currency_data_archives', []);
      return rows[0].count;
    });

    return {
      archives: archives.map(archive => ({
        id: archive.id,
        criteria: JSON.parse(archive.criteria),
        archiveTo: archive.archive_to,
        retentionPeriod: archive.retention_period_days,
        recordsArchived: archive.records_archived,
        archiveSize: archive.archive_size_bytes,
        requestedBy: archive.requested_by,
        reason: archive.reason,
        status: archive.status,
        createdAt: archive.created_at
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit)
      }
    };
  }

  async handleGetSuspiciousCurrencyActivities(query) {
    let sql = `
      SELECT id, conversion_id, user_id, activity_type, severity, indicators,
             risk_score, automatic_action, requires_review, escalation_level,
             status, created_at
      FROM suspicious_currency_activities
      WHERE 1=1
    `;
    const params = [];

    if (query.conversionId) {
      sql += ' AND conversion_id = ?';
      params.push(query.conversionId);
    }

    if (query.userId) {
      sql += ' AND user_id = ?';
      params.push(query.userId);
    }

    if (query.activityType) {
      sql += ' AND activity_type = ?';
      params.push(query.activityType);
    }

    if (query.severity) {
      sql += ' AND severity = ?';
      params.push(query.severity);
    }

    if (query.status !== 'all') {
      sql += ' AND status = ?';
      params.push(query.status);
    }

    if (query.minRiskScore !== undefined) {
      sql += ' AND risk_score >= ?';
      params.push(query.minRiskScore);
    }

    if (query.maxRiskScore !== undefined) {
      sql += ' AND risk_score <= ?';
      params.push(query.maxRiskScore);
    }

    if (query.startDate) {
      sql += ' AND created_at >= ?';
      params.push(query.startDate);
    }

    if (query.endDate) {
      sql += ' AND created_at <= ?';
      params.push(query.endDate);
    }

    sql += ` ORDER BY ${query.sortBy} ${query.sortOrder} LIMIT ? OFFSET ?`;
    params.push(query.limit, (query.page - 1) * query.limit);

    const activities = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(sql, params);
      return rows;
    });

    const total = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      let countSql = 'SELECT COUNT(*) as count FROM suspicious_currency_activities WHERE 1=1';
      const countParams = params.slice(0, -2); // Remove limit and offset
      const [rows] = await connection.execute(countSql, countParams);
      return rows[0].count;
    });

    return {
      activities: activities.map(activity => ({
        id: activity.id,
        conversionId: activity.conversion_id,
        userId: activity.user_id,
        activityType: activity.activity_type,
        severity: activity.severity,
        indicators: JSON.parse(activity.indicators || '[]'),
        riskScore: activity.risk_score,
        automaticAction: JSON.parse(activity.automatic_action || '[]'),
        requiresReview: activity.requires_review,
        escalationLevel: activity.escalation_level,
        status: activity.status,
        createdAt: activity.created_at
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit)
      }
    };
  }

  async handleGetCurrencyReports(query) {
    let sql = `
      SELECT id, report_id, report_type, format, record_count, file_size_bytes,
             generation_time_ms, generated_by, status, created_at
      FROM currency_reports
      WHERE 1=1
    `;
    const params = [];

    if (query.reportType) {
      sql += ' AND report_type = ?';
      params.push(query.reportType);
    }

    if (query.generatedBy) {
      sql += ' AND generated_by = ?';
      params.push(query.generatedBy);
    }

    if (query.format) {
      sql += ' AND format = ?';
      params.push(query.format);
    }

    if (query.status !== 'all') {
      sql += ' AND status = ?';
      params.push(query.status);
    }

    if (query.startDate) {
      sql += ' AND created_at >= ?';
      params.push(query.startDate);
    }

    if (query.endDate) {
      sql += ' AND created_at <= ?';
      params.push(query.endDate);
    }

    sql += ` ORDER BY ${query.sortBy} ${query.sortOrder} LIMIT ? OFFSET ?`;
    params.push(query.limit, (query.page - 1) * query.limit);

    const reports = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(sql, params);
      return rows;
    });

    const total = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      let countSql = 'SELECT COUNT(*) as count FROM currency_reports WHERE 1=1';
      const countParams = params.slice(0, -2);
      const [rows] = await connection.execute(countSql, countParams);
      return rows[0].count;
    });

    return {
      reports: reports.map(report => ({
        id: report.id,
        reportId: report.report_id,
        reportType: report.report_type,
        format: report.format,
        recordCount: report.record_count,
        fileSize: report.file_size_bytes,
        generationTime: report.generation_time_ms,
        generatedBy: report.generated_by,
        status: report.status,
        createdAt: report.created_at
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit)
      }
    };
  }

  async handleGetCurrencyRetentionPolicies(query) {
    let sql = `
      SELECT id, policy_id, name, description, approved_by, effective_date, status
      FROM currency_retention_policies
      WHERE 1=1
    `;
    const params = [];

    if (query.policyId) {
      sql += ' AND policy_id = ?';
      params.push(query.policyId);
    }

    if (query.name) {
      sql += ' AND name LIKE ?';
      params.push(`%${query.name}%`);
    }

    if (query.approvedBy) {
      sql += ' AND approved_by = ?';
      params.push(query.approvedBy);
    }

    if (query.status !== 'all') {
      sql += ' AND status = ?';
      params.push(query.status);
    }

    if (query.effectiveDate) {
      sql += ' AND effective_date <= ?';
      params.push(query.effectiveDate);
    }

    sql += ' ORDER BY effective_date DESC LIMIT ? OFFSET ?';
    params.push(query.limit, (query.page - 1) * query.limit);

    const policies = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(sql, params);
      return rows;
    });

    const total = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      let countSql = 'SELECT COUNT(*) as count FROM currency_retention_policies WHERE 1=1';
      const countParams = params.slice(0, -2);
      const [rows] = await connection.execute(countSql, countParams);
      return rows[0].count;
    });

    return {
      policies: policies.map(policy => ({
        id: policy.id,
        policyId: policy.policy_id,
        name: policy.name,
        description: policy.description,
        approvedBy: policy.approved_by,
        effectiveDate: policy.effective_date,
        status: policy.status
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit)
      }
    };
  }

  async handleGetCurrencyRiskProfiles(query) {
    let sql = `
      SELECT currency_code, risk_level, volatility_index, liquidity_score,
             regulatory_flags, sanctions_status, updated_by, updated_at
      FROM currency_risk_profiles
      WHERE 1=1
    `;
    const params = [];

    if (query.currencyCode) {
      sql += ' AND currency_code = ?';
      params.push(query.currencyCode);
    }

    if (query.riskLevel) {
      sql += ' AND risk_level = ?';
      params.push(query.riskLevel);
    }

    if (query.sanctionsStatus) {
      sql += ' AND sanctions_status = ?';
      params.push(query.sanctionsStatus);
    }

    if (query.minVolatilityIndex !== undefined) {
      sql += ' AND volatility_index >= ?';
      params.push(query.minVolatilityIndex);
    }

    if (query.maxVolatilityIndex !== undefined) {
      sql += ' AND volatility_index <= ?';
      params.push(query.maxVolatilityIndex);
    }

    if (query.minLiquidityScore !== undefined) {
      sql += ' AND liquidity_score >= ?';
      params.push(query.minLiquidityScore);
    }

    if (query.maxLiquidityScore !== undefined) {
      sql += ' AND liquidity_score <= ?';
      params.push(query.maxLiquidityScore);
    }

    sql += ` ORDER BY ${query.sortBy} ${query.sortOrder} LIMIT ? OFFSET ?`;
    params.push(query.limit, (query.page - 1) * query.limit);

    const profiles = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(sql, params);
      return rows;
    });

    const total = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      let countSql = 'SELECT COUNT(*) as count FROM currency_risk_profiles WHERE 1=1';
      const countParams = params.slice(0, -2);
      const [rows] = await connection.execute(countSql, countParams);
      return rows[0].count;
    });

    return {
      profiles: profiles.map(profile => ({
        currencyCode: profile.currency_code,
        riskLevel: profile.risk_level,
        volatilityIndex: profile.volatility_index,
        liquidityScore: profile.liquidity_score,
        regulatoryFlags: JSON.parse(profile.regulatory_flags || '[]'),
        sanctionsStatus: profile.sanctions_status,
        updatedBy: profile.updated_by,
        updatedAt: profile.updated_at
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit)
      }
    };
  }

  async handleGetCurrencyComplianceReports(query) {
    let sql = `
      SELECT id, check_type, compliance_status, violations, risk_score,
             required_actions, created_at
      FROM currency_compliance_checks
      WHERE 1=1
    `;
    const params = [];

    if (query.currencyCode) {
      sql += ' AND currency_code = ?';
      params.push(query.currencyCode);
    }

    if (query.userId) {
      sql += ' AND user_id = ?';
      params.push(query.userId);
    }

    if (query.conversionId) {
      sql += ' AND conversion_id = ?';
      params.push(query.conversionId);
    }

    if (query.complianceStatus) {
      sql += ' AND compliance_status = ?';
      params.push(query.complianceStatus);
    }

    if (query.checkType) {
      sql += ' AND check_type = ?';
      params.push(query.checkType);
    }

    if (query.minRiskScore !== undefined) {
      sql += ' AND risk_score >= ?';
      params.push(query.minRiskScore);
    }

    if (query.maxRiskScore !== undefined) {
      sql += ' AND risk_score <= ?';
      params.push(query.maxRiskScore);
    }

    if (query.startDate) {
      sql += ' AND created_at >= ?';
      params.push(query.startDate);
    }

    if (query.endDate) {
      sql += ' AND created_at <= ?';
      params.push(query.endDate);
    }

    sql += ` ORDER BY ${query.sortBy} ${query.sortOrder} LIMIT ? OFFSET ?`;
    params.push(query.limit, (query.page - 1) * query.limit);

    const reports = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(sql, params);
      return rows;
    });

    const total = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      let countSql = 'SELECT COUNT(*) as count FROM currency_compliance_checks WHERE 1=1';
      const countParams = params.slice(0, -2);
      const [rows] = await connection.execute(countSql, countParams);
      return rows[0].count;
    });

    return {
      reports: reports.map(report => ({
        id: report.id,
        checkType: report.check_type,
        complianceStatus: report.compliance_status,
        violations: JSON.parse(report.violations || '[]'),
        riskScore: report.risk_score,
        requiredActions: JSON.parse(report.required_actions || '[]'),
        createdAt: report.created_at
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit)
      }
    };
  }

  async handleGetCurrencyFraudAlerts(query) {
    let sql = `
      SELECT id, alert_id, fraud_type, severity, affected_users, affected_conversions,
             indicators, recommended_actions, escalation_required, status, created_at
      FROM currency_fraud_alerts
      WHERE 1=1
    `;
    const params = [];

    if (query.alertId) {
      sql += ' AND alert_id = ?';
      params.push(query.alertId);
    }

    if (query.fraudType) {
      sql += ' AND fraud_type = ?';
      params.push(query.fraudType);
    }

    if (query.severity) {
      sql += ' AND severity = ?';
      params.push(query.severity);
    }

    if (query.status !== 'all') {
      sql += ' AND status = ?';
      params.push(query.status);
    }

    if (query.affectedUserId) {
      sql += ' AND JSON_CONTAINS(affected_users, ?)';
      params.push(`"${query.affectedUserId}"`);
    }

    if (query.escalationRequired !== undefined) {
      sql += ' AND escalation_required = ?';
      params.push(query.escalationRequired);
    }

    if (query.startDate) {
      sql += ' AND created_at >= ?';
      params.push(query.startDate);
    }

    if (query.endDate) {
      sql += ' AND created_at <= ?';
      params.push(query.endDate);
    }

    sql += ` ORDER BY ${query.sortBy} ${query.sortOrder} LIMIT ? OFFSET ?`;
    params.push(query.limit, (query.page - 1) * query.limit);

    const alerts = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(sql, params);
      return rows;
    });

    const total = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      let countSql = 'SELECT COUNT(*) as count FROM currency_fraud_alerts WHERE 1=1';
      const countParams = params.slice(0, -2);
      const [rows] = await connection.execute(countSql, countParams);
      return rows[0].count;
    });

    return {
      alerts: alerts.map(alert => ({
        id: alert.id,
        alertId: alert.alert_id,
        fraudType: alert.fraud_type,
        severity: alert.severity,
        affectedUsers: JSON.parse(alert.affected_users || '[]'),
        affectedConversions: JSON.parse(alert.affected_conversions || '[]'),
        indicators: JSON.parse(alert.indicators || '[]'),
        recommendedActions: JSON.parse(alert.recommended_actions || '[]'),
        escalationRequired: alert.escalation_required,
        status: alert.status,
        createdAt: alert.created_at
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit)
      }
    };
  }

  async handleGetCurrencyExposureAnalysis(query) {
    // This is a complex analysis that would typically involve multiple calculations
    // Simplified implementation for demonstration

    const exposure = {
      currencyCode: query.currencyCode,
      userId: query.userId,
      portfolioId: query.portfolioId,
      timeframe: query.timeframe,
      analysis: {}
    };

    // Calculate various risk metrics
    if (query.riskMetrics.includes('var')) {
      exposure.analysis.var = await this.calculateValueAtRisk(query);
    }

    if (query.riskMetrics.includes('correlation')) {
      exposure.analysis.correlation = await this.calculateCurrencyCorrelation(query);
    }

    if (query.riskMetrics.includes('volatility')) {
      exposure.analysis.volatility = await this.calculateVolatility(query);
    }

    // Group by analysis
    exposure.groupedBy = await this.groupExposureBy(query);

    return exposure;
  }

  // Helper methods
  async getLatestExchangeRates(baseCurrency) {
    const rates = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT rates FROM exchange_rates WHERE base_currency = ? ORDER BY timestamp DESC LIMIT 1',
        [baseCurrency]
      );

      if (rows.length > 0) {
        return JSON.parse(rows[0].rates);
      }
      return {};
    });

    return rates;
  }

  async getHistoricalExchangeRates(baseCurrency, date) {
    const rates = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT rates FROM exchange_rates WHERE base_currency = ? AND DATE(timestamp) = ? ORDER BY timestamp DESC LIMIT 1',
        [baseCurrency, date]
      );

      if (rows.length > 0) {
        return JSON.parse(rows[0].rates);
      }
      return {};
    });

    return rates;
  }

  async getExchangeRate(fromCurrency, toCurrency) {
    const baseRates = await this.getLatestExchangeRates('USD');

    if (fromCurrency === 'USD') {
      return baseRates[toCurrency] || null;
    } else if (toCurrency === 'USD') {
      return 1 / (baseRates[fromCurrency] || 0);
    } else {
      const fromRate = baseRates[fromCurrency];
      const toRate = baseRates[toCurrency];
      return toRate && fromRate ? toRate / fromRate : null;
    }
  }

  calculateConversionFee(amount, fromCurrency, toCurrency) {
    const feePercentage = 0.001; // 0.1%
    return amount * feePercentage;
  }

  getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }

  setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  async getAnalyticsByCurrencyPair(startDate, endDate) {
    const analytics = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(`
        SELECT
          CONCAT(from_currency, '-', to_currency) as currency_pair,
          COUNT(*) as conversions,
          SUM(amount) as total_amount,
          AVG(converted_amount / amount) as avg_rate,
          SUM(fee) as total_fees
        FROM currency_conversions
        WHERE timestamp BETWEEN ? AND ?
        GROUP BY from_currency, to_currency
        ORDER BY conversions DESC
        LIMIT 20
      `, [startDate, endDate]);
      return rows;
    });

    return analytics.map(row => ({
      currencyPair: row.currency_pair,
      conversions: row.conversions,
      totalAmount: parseFloat(row.total_amount),
      averageRate: parseFloat(row.avg_rate),
      totalFees: parseFloat(row.total_fees)
    }));
  }

  async getAnalyticsByUser(startDate, endDate) {
    const analytics = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(`
        SELECT
          user_id,
          COUNT(*) as conversions,
          SUM(amount) as total_amount,
          SUM(fee) as total_fees
        FROM currency_conversions
        WHERE timestamp BETWEEN ? AND ?
        GROUP BY user_id
        ORDER BY conversions DESC
        LIMIT 20
      `, [startDate, endDate]);
      return rows;
    });

    return analytics.map(row => ({
      userId: row.user_id,
      conversions: row.conversions,
      totalAmount: parseFloat(row.total_amount),
      totalFees: parseFloat(row.total_fees)
    }));
  }

  async getAnalyticsByDay(startDate, endDate) {
    const analytics = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(`
        SELECT
          DATE(timestamp) as date,
          COUNT(*) as conversions,
          SUM(amount) as total_amount,
          SUM(fee) as total_fees
        FROM currency_conversions
        WHERE timestamp BETWEEN ? AND ?
        GROUP BY DATE(timestamp)
        ORDER BY date
      `, [startDate, endDate]);
      return rows;
    });

    return analytics.map(row => ({
      date: row.date,
      conversions: row.conversions,
      totalAmount: parseFloat(row.total_amount),
      totalFees: parseFloat(row.total_fees)
    }));
  }

  async getOverallAnalytics(startDate, endDate) {
    const analytics = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(`
        SELECT
          COUNT(*) as total_conversions,
          SUM(amount) as total_amount,
          AVG(converted_amount / amount) as avg_rate,
          SUM(fee) as total_fees,
          COUNT(DISTINCT user_id) as unique_users,
          COUNT(DISTINCT CONCAT(from_currency, '-', to_currency)) as unique_pairs
        FROM currency_conversions
        WHERE timestamp BETWEEN ? AND ?
      `, [startDate, endDate]);
      return rows[0];
    });

    return {
      totalConversions: analytics.total_conversions,
      totalAmount: parseFloat(analytics.total_amount || 0),
      averageRate: parseFloat(analytics.avg_rate || 0),
      totalFees: parseFloat(analytics.total_fees || 0),
      uniqueUsers: analytics.unique_users,
      uniqueCurrencyPairs: analytics.unique_pairs
    };
  }

  async getServiceMetrics() {
    const metrics = {};

    // Get recent event counts
    const eventCount = await this.eventStore.getEventCount('currency', Date.now() - (24 * 60 * 60 * 1000));
    metrics.recentEvents = eventCount;

    // Get active currencies count
    const currencyCount = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute('SELECT COUNT(*) as count FROM currencies WHERE is_active = 1');
      return rows[0].count;
    });
    metrics.activeCurrencies = currencyCount;

    // Get recent conversion count
    const conversionCount = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute('SELECT COUNT(*) as count FROM currency_conversions WHERE timestamp > DATE_SUB(NOW(), INTERVAL 1 HOUR)');
      return rows[0].count;
    });
    metrics.recentConversions = conversionCount;

    return metrics;
  }

  // Exposure analysis helper methods
  async calculateValueAtRisk(query) {
    // Simplified VaR calculation - in reality this would be much more complex
    const conversions = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      let sql = 'SELECT amount, converted_amount FROM currency_conversions WHERE 1=1';
      const params = [];

      if (query.currencyCode) {
        sql += ' AND (from_currency = ? OR to_currency = ?)';
        params.push(query.currencyCode, query.currencyCode);
      }

      if (query.userId) {
        sql += ' AND user_id = ?';
        params.push(query.userId);
      }

      sql += ' ORDER BY timestamp DESC LIMIT 1000';

      const [rows] = await connection.execute(sql, params);
      return rows;
    });

    if (conversions.length === 0) return { var95: 0, var99: 0 };

    // Simple VaR calculation based on historical data
    const losses = conversions.map(c => c.amount - c.converted_amount);
    losses.sort((a, b) => a - b);

    const var95 = losses[Math.floor(losses.length * 0.05)] || 0;
    const var99 = losses[Math.floor(losses.length * 0.01)] || 0;

    return { var95, var99 };
  }

  async calculateCurrencyCorrelation(query) {
    // Simplified correlation calculation
    const correlations = {};

    // Get currency pairs data
    const pairs = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(`
        SELECT from_currency, to_currency, AVG(converted_amount / amount) as avg_rate
        FROM currency_conversions
        WHERE timestamp > DATE_SUB(NOW(), INTERVAL 30 DAY)
        GROUP BY from_currency, to_currency
        HAVING COUNT(*) > 10
      `);
      return rows;
    });

    // Calculate simple correlations (simplified)
    for (const pair of pairs) {
      correlations[`${pair.from_currency}/${pair.to_currency}`] = {
        correlation: Math.random() * 2 - 1, // Random for demo
        strength: pair.avg_rate > 1 ? 'strong' : 'weak'
      };
    }

    return correlations;
  }

  async calculateVolatility(query) {
    // Calculate currency volatility
    const volatility = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(`
        SELECT
          from_currency,
          to_currency,
          STDDEV(converted_amount / amount) as volatility,
          AVG(converted_amount / amount) as avg_rate
        FROM currency_conversions
        WHERE timestamp > DATE_SUB(NOW(), INTERVAL 30 DAY)
        GROUP BY from_currency, to_currency
      `);
      return rows;
    });

    return volatility.map(v => ({
      pair: `${v.from_currency}/${v.to_currency}`,
      volatility: parseFloat(v.volatility || 0),
      averageRate: parseFloat(v.avg_rate || 0)
    }));
  }

  async groupExposureBy(query) {
    let sql = 'SELECT ';
    const params = [];

    switch (query.groupBy) {
      case 'currency':
        sql += 'from_currency as group_key, SUM(amount) as total_exposure';
        break;
      case 'region':
        sql += 'LEFT(from_currency, 2) as group_key, SUM(amount) as total_exposure';
        break;
      case 'type':
        sql += `'fiat' as group_key, SUM(amount) as total_exposure`; // Simplified
        break;
      case 'user':
        sql += 'user_id as group_key, SUM(amount) as total_exposure';
        break;
      default:
        sql += 'from_currency as group_key, SUM(amount) as total_exposure';
    }

    sql += ' FROM currency_conversions WHERE 1=1';

    if (query.currencyCode) {
      sql += ' AND (from_currency = ? OR to_currency = ?)';
      params.push(query.currencyCode, query.currencyCode);
    }

    if (query.userId) {
      sql += ' AND user_id = ?';
      params.push(query.userId);
    }

    if (query.timeframe) {
      const days = query.timeframe.replace('d', '');
      sql += ' AND timestamp > DATE_SUB(NOW(), INTERVAL ? DAY)';
      params.push(parseInt(days));
    }

    sql += ' GROUP BY group_key ORDER BY total_exposure DESC';

    const grouped = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(sql, params);
      return rows;
    });

    return grouped.map(g => ({
      group: g.group_key,
      exposure: parseFloat(g.total_exposure),
      percentage: 0 // Would calculate relative to total
    }));
  }
}