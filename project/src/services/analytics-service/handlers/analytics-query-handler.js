import {
  GetTransactionAnalyticsQuery,
  GetUserActivityAnalyticsQuery,
  GetPaymentMethodsAnalyticsQuery,
  GetRevenueAnalyticsQuery,
  GetAccountAnalyticsQuery,
  GetAnalyticsDashboardQuery,
  GetAnalyticsDashboardsQuery,
  GetAnalyticsReportQuery,
  GetAnalyticsMetricsQuery
} from '../queries/analytics-queries.js';

export class AnalyticsQueryHandler {
  constructor(dependencies) {
    this.connectionPool = dependencies.connectionPool;
    this.cache = dependencies.cache || new Map();
    this.logger = dependencies.logger;
  }

  async handle(query) {
    try {
      query.validate();

      switch (query.constructor.name) {
        case 'GetTransactionAnalyticsQuery':
          return await this.handleGetTransactionAnalytics(query);
        case 'GetUserActivityAnalyticsQuery':
          return await this.handleGetUserActivityAnalytics(query);
        case 'GetPaymentMethodsAnalyticsQuery':
          return await this.handleGetPaymentMethodsAnalytics(query);
        case 'GetRevenueAnalyticsQuery':
          return await this.handleGetRevenueAnalytics(query);
        case 'GetAccountAnalyticsQuery':
          return await this.handleGetAccountAnalytics(query);
        case 'GetAnalyticsDashboardQuery':
          return await this.handleGetAnalyticsDashboard(query);
        case 'GetAnalyticsDashboardsQuery':
          return await this.handleGetAnalyticsDashboards(query);
        case 'GetAnalyticsReportQuery':
          return await this.handleGetAnalyticsReport(query);
        case 'GetAnalyticsMetricsQuery':
          return await this.handleGetAnalyticsMetrics(query);
        default:
          throw new Error(`Unknown query type: ${query.constructor.name}`);
      }
    } catch (error) {
      this.logger.error(`Error handling query ${query.constructor.name}:`, error);
      throw error;
    }
  }

  async handleGetTransactionAnalytics(query) {
    const cacheKey = `transaction_analytics:${JSON.stringify({
      startDate: query.startDate,
      endDate: query.endDate,
      groupBy: query.groupBy,
      filters: query.filters,
      metrics: query.metrics,
      page: query.page,
      limit: query.limit
    })}`;

    let result = this.cache.get(cacheKey);

    if (!result) {
      const data = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        let queryStr = `
          SELECT
            DATE_FORMAT(at.created_at, '${this.getDateFormat(query.groupBy)}') as period,
            COUNT(*) as transaction_count,
            COALESCE(SUM(at.amount), 0) as total_volume,
            AVG(at.amount) as average_amount
        `;

        // Add additional metrics if requested
        if (query.metrics.includes('min')) {
          queryStr += ', MIN(at.amount) as min_amount';
        }
        if (query.metrics.includes('max')) {
          queryStr += ', MAX(at.amount) as max_amount';
        }
        if (query.metrics.includes('median')) {
          queryStr += ', 0 as median_amount'; // Would need more complex query for actual median
        }

        queryStr += `
          FROM account_transactions at
          WHERE at.type IN ('deposit', 'withdrawal', 'transfer')
        `;

        const params = [];

        if (query.startDate) {
          queryStr += ' AND at.created_at >= ?';
          params.push(query.startDate);
        }

        if (query.endDate) {
          queryStr += ' AND at.created_at <= ?';
          params.push(query.endDate);
        }

        // Apply filters
        if (query.filters.accountId) {
          queryStr += ' AND at.account_id = ?';
          params.push(query.filters.accountId);
        }

        if (query.filters.currency) {
          queryStr += ' AND at.currency = ?';
          params.push(query.filters.currency);
        }

        queryStr += ` GROUP BY period ORDER BY period DESC`;

        // Add pagination
        const offset = (query.page - 1) * query.limit;
        queryStr += ` LIMIT ? OFFSET ?`;
        params.push(query.limit, offset);

        const [rows] = await connection.execute(queryStr, params);

        // Get total count for pagination
        const countQuery = `
          SELECT COUNT(DISTINCT DATE_FORMAT(at.created_at, '${this.getDateFormat(query.groupBy)}')) as total
          FROM account_transactions at
          WHERE at.type IN ('deposit', 'withdrawal', 'transfer')
        `;

        const countParams = [...params.slice(0, -2)]; // Remove limit and offset
        const [countResult] = await connection.execute(countQuery, countParams);
        const total = countResult[0].total;

        return {
          data: rows,
          pagination: {
            page: query.page,
            limit: query.limit,
            total,
            totalPages: Math.ceil(total / query.limit)
          }
        };
      });

      result = {
        analytics: data.data,
        pagination: data.pagination,
        metadata: {
          queryId: query.queryId,
          dateRange: { startDate: query.startDate, endDate: query.endDate },
          groupBy: query.groupBy,
          metrics: query.metrics,
          generatedAt: new Date().toISOString()
        }
      };

      // Cache for 5 minutes
      this.cache.set(cacheKey, result);
      setTimeout(() => this.cache.delete(cacheKey), 5 * 60 * 1000);
    }

    this.logger.info('Transaction analytics retrieved successfully', {
      queryId: query.queryId,
      recordCount: result.analytics.length
    });

    return result;
  }

  async handleGetUserActivityAnalytics(query) {
    const cacheKey = `user_activity:${JSON.stringify({
      startDate: query.startDate,
      endDate: query.endDate,
      metric: query.metric,
      groupBy: query.groupBy,
      filters: query.filters,
      segmentBy: query.segmentBy,
      page: query.page,
      limit: query.limit
    })}`;

    let result = this.cache.get(cacheKey);

    if (!result) {
      const data = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        let queryStr;
        const params = [];

        switch (query.metric) {
          case 'transactions':
            queryStr = `
              SELECT
                DATE_FORMAT(at.created_at, '${this.getDateFormat(query.groupBy)}') as period,
                COUNT(DISTINCT at.account_id) as active_users,
                COUNT(*) as total_transactions,
                AVG(at.amount) as average_transaction_amount,
                SUM(at.amount) as total_transaction_volume
              FROM account_transactions at
              JOIN accounts a ON at.account_id = a.id
              WHERE at.type IN ('deposit', 'withdrawal', 'transfer')
            `;
            break;

          case 'logins':
            queryStr = `
              SELECT
                DATE_FORMAT(created_at, '${this.getDateFormat(query.groupBy)}') as period,
                COUNT(*) as login_count,
                COUNT(DISTINCT user_id) as unique_users
              FROM user_sessions
              WHERE 1=1
            `;
            break;

          case 'accounts_created':
            queryStr = `
              SELECT
                DATE_FORMAT(created_at, '${this.getDateFormat(query.groupBy)}') as period,
                COUNT(*) as accounts_created
              FROM accounts
              WHERE 1=1
            `;
            break;

          case 'payments':
            queryStr = `
              SELECT
                DATE_FORMAT(created_at, '${this.getDateFormat(query.groupBy)}') as period,
                COUNT(*) as payment_count,
                COUNT(DISTINCT account_id) as paying_users,
                SUM(amount) as total_payment_amount
              FROM payments
              WHERE status = 'completed'
            `;
            break;

          default:
            throw new Error(`Unsupported metric: ${query.metric}`);
        }

        if (query.startDate) {
          queryStr += ' AND created_at >= ?';
          params.push(query.startDate);
        }

        if (query.endDate) {
          queryStr += ' AND created_at <= ?';
          params.push(query.endDate);
        }

        // Apply segmentation
        if (query.segmentBy === 'new_users') {
          queryStr += ` AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`;
        } else if (query.segmentBy === 'active_users') {
          queryStr += ` AND account_id IN (
            SELECT DISTINCT account_id FROM account_transactions
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
          )`;
        } else if (query.segmentBy === 'inactive_users') {
          queryStr += ` AND account_id NOT IN (
            SELECT DISTINCT account_id FROM account_transactions
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
          )`;
        }

        queryStr += ` GROUP BY period ORDER BY period DESC`;

        // Add pagination
        const offset = (query.page - 1) * query.limit;
        queryStr += ` LIMIT ? OFFSET ?`;
        params.push(query.limit, offset);

        const [rows] = await connection.execute(queryStr, params);

        // Get total count
        const countQuery = `SELECT COUNT(*) as total FROM (${queryStr.replace(' LIMIT ? OFFSET ?', '')}) as subquery`;
        const [countResult] = await connection.execute(countQuery, params.slice(0, -2));
        const total = countResult[0].total;

        return {
          data: rows,
          pagination: {
            page: query.page,
            limit: query.limit,
            total,
            totalPages: Math.ceil(total / query.limit)
          }
        };
      });

      result = {
        activity: data.data,
        pagination: data.pagination,
        metadata: {
          queryId: query.queryId,
          metric: query.metric,
          segmentBy: query.segmentBy,
          dateRange: { startDate: query.startDate, endDate: query.endDate },
          groupBy: query.groupBy,
          generatedAt: new Date().toISOString()
        }
      };

      this.cache.set(cacheKey, result);
      setTimeout(() => this.cache.delete(cacheKey), 5 * 60 * 1000);
    }

    this.logger.info('User activity analytics retrieved successfully', {
      queryId: query.queryId,
      metric: query.metric,
      recordCount: result.activity.length
    });

    return result;
  }

  async handleGetPaymentMethodsAnalytics(query) {
    const cacheKey = `payment_methods:${JSON.stringify({
      startDate: query.startDate,
      endDate: query.endDate,
      groupBy: query.groupBy,
      filters: query.filters,
      includeTrends: query.includeTrends,
      includeComparison: query.includeComparison,
      page: query.page,
      limit: query.limit
    })}`;

    let result = this.cache.get(cacheKey);

    if (!result) {
      const data = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        let queryStr = `
          SELECT
            payment_method,
            COUNT(*) as transaction_count,
            COALESCE(SUM(amount), 0) as total_volume,
            AVG(amount) as average_amount,
            COUNT(DISTINCT account_id) as unique_users,
            MAX(created_at) as last_used
        `;

        if (query.includeTrends) {
          queryStr += `,
            COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as weekly_count,
            COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as monthly_count
          `;
        }

        queryStr += ` FROM payments WHERE status = 'completed'`;

        const params = [];

        if (query.startDate) {
          queryStr += ' AND created_at >= ?';
          params.push(query.startDate);
        }

        if (query.endDate) {
          queryStr += ' AND created_at <= ?';
          params.push(query.endDate);
        }

        if (query.filters.currency) {
          queryStr += ' AND currency = ?';
          params.push(query.filters.currency);
        }

        if (query.groupBy === 'day') {
          queryStr = `
            SELECT
              DATE_FORMAT(created_at, '%Y-%m-%d') as period,
              payment_method,
              COUNT(*) as transaction_count,
              COALESCE(SUM(amount), 0) as total_volume,
              AVG(amount) as average_amount
            FROM payments
            WHERE status = 'completed'
          ` + (query.startDate ? ' AND created_at >= ?' : '') + (query.endDate ? ' AND created_at <= ?' : '') +
          ` GROUP BY period, payment_method ORDER BY period DESC, total_volume DESC`;
        } else {
          queryStr += ` GROUP BY payment_method ORDER BY total_volume DESC`;
        }

        // Add pagination
        const offset = (query.page - 1) * query.limit;
        queryStr += ` LIMIT ? OFFSET ?`;
        params.push(query.limit, offset);

        const [rows] = await connection.execute(queryStr, params);

        // Get total count
        let countQuery;
        if (query.groupBy === 'day') {
          countQuery = `SELECT COUNT(DISTINCT CONCAT(DATE_FORMAT(created_at, '%Y-%m-%d'), payment_method)) as total FROM payments WHERE status = 'completed'`;
        } else {
          countQuery = `SELECT COUNT(DISTINCT payment_method) as total FROM payments WHERE status = 'completed'`;
        }

        const countParams = params.slice(0, -2);
        const [countResult] = await connection.execute(countQuery, countParams);
        const total = countResult[0].total;

        return {
          data: rows,
          pagination: {
            page: query.page,
            limit: query.limit,
            total,
            totalPages: Math.ceil(total / query.limit)
          }
        };
      });

      result = {
        paymentMethods: data.data,
        pagination: data.pagination,
        metadata: {
          queryId: query.queryId,
          groupBy: query.groupBy,
          includeTrends: query.includeTrends,
          includeComparison: query.includeComparison,
          dateRange: { startDate: query.startDate, endDate: query.endDate },
          generatedAt: new Date().toISOString()
        }
      };

      this.cache.set(cacheKey, result);
      setTimeout(() => this.cache.delete(cacheKey), 5 * 60 * 1000);
    }

    this.logger.info('Payment methods analytics retrieved successfully', {
      queryId: query.queryId,
      recordCount: result.paymentMethods.length
    });

    return result;
  }

  async handleGetRevenueAnalytics(query) {
    const cacheKey = `revenue:${JSON.stringify({
      startDate: query.startDate,
      endDate: query.endDate,
      groupBy: query.groupBy,
      filters: query.filters,
      includeFees: query.includeFees,
      includeRefunds: query.includeRefunds,
      currency: query.currency,
      page: query.page,
      limit: query.limit
    })}`;

    let result = this.cache.get(cacheKey);

    if (!result) {
      const data = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        let queryStr = `
          SELECT
            DATE_FORMAT(p.created_at, '${this.getDateFormat(query.groupBy)}') as period,
            COALESCE(SUM(p.amount), 0) as total_revenue
        `;

        if (query.includeFees) {
          queryStr += ', COALESCE(SUM(p.fee_amount), 0) as total_fees';
        }

        if (query.includeRefunds) {
          queryStr += `,
            COALESCE(SUM(CASE WHEN p.type = 'refund' THEN p.amount ELSE 0 END), 0) as total_refunds,
            COALESCE(SUM(CASE WHEN p.type != 'refund' THEN p.amount ELSE 0 END), 0) as net_revenue
          `;
        }

        queryStr += `,
          COUNT(*) as transaction_count,
          COUNT(DISTINCT p.account_id) as unique_customers
        `;

        queryStr += ` FROM payments p WHERE p.status = 'completed'`;

        const params = [];

        if (query.startDate) {
          queryStr += ' AND p.created_at >= ?';
          params.push(query.startDate);
        }

        if (query.endDate) {
          queryStr += ' AND p.created_at <= ?';
          params.push(query.endDate);
        }

        if (query.currency) {
          queryStr += ' AND p.currency = ?';
          params.push(query.currency);
        }

        if (!query.includeRefunds) {
          queryStr += ` AND p.type != 'refund'`;
        }

        queryStr += ` GROUP BY period ORDER BY period DESC`;

        // Add pagination
        const offset = (query.page - 1) * query.limit;
        queryStr += ` LIMIT ? OFFSET ?`;
        params.push(query.limit, offset);

        const [rows] = await connection.execute(queryStr, params);

        // Get total count
        const countQuery = `SELECT COUNT(DISTINCT DATE_FORMAT(created_at, '${this.getDateFormat(query.groupBy)}')) as total FROM payments WHERE status = 'completed'`;
        const countParams = params.slice(0, -2);
        const [countResult] = await connection.execute(countQuery, countParams);
        const total = countResult[0].total;

        return {
          data: rows,
          pagination: {
            page: query.page,
            limit: query.limit,
            total,
            totalPages: Math.ceil(total / query.limit)
          }
        };
      });

      result = {
        revenue: data.data,
        pagination: data.pagination,
        metadata: {
          queryId: query.queryId,
          groupBy: query.groupBy,
          includeFees: query.includeFees,
          includeRefunds: query.includeRefunds,
          currency: query.currency,
          dateRange: { startDate: query.startDate, endDate: query.endDate },
          generatedAt: new Date().toISOString()
        }
      };

      this.cache.set(cacheKey, result);
      setTimeout(() => this.cache.delete(cacheKey), 5 * 60 * 1000);
    }

    this.logger.info('Revenue analytics retrieved successfully', {
      queryId: query.queryId,
      recordCount: result.revenue.length
    });

    return result;
  }

  async handleGetAccountAnalytics(query) {
    const cacheKey = `account_analytics:${JSON.stringify({
      startDate: query.startDate,
      endDate: query.endDate,
      metrics: query.metrics,
      groupBy: query.groupBy,
      filters: query.filters,
      includeGeographic: query.includeGeographic,
      page: query.page,
      limit: query.limit
    })}`;

    let result = this.cache.get(cacheKey);

    if (!result) {
      const data = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        let queryStr = `
          SELECT
            a.account_type,
            a.currency,
            COUNT(*) as account_count,
            AVG(a.balance) as average_balance,
            SUM(a.balance) as total_balance,
            MIN(a.balance) as min_balance,
            MAX(a.balance) as max_balance
        `;

        if (query.includeGeographic) {
          queryStr += `,
            a.country,
            a.city,
            COUNT(*) as accounts_by_location
          `;
        }

        queryStr += ` FROM accounts a WHERE a.status = 'active'`;

        const params = [];

        if (query.startDate) {
          queryStr += ' AND a.created_at >= ?';
          params.push(query.startDate);
        }

        if (query.endDate) {
          queryStr += ' AND a.created_at <= ?';
          params.push(query.endDate);
        }

        if (query.filters.accountType) {
          queryStr += ' AND a.account_type = ?';
          params.push(query.filters.accountType);
        }

        if (query.filters.currency) {
          queryStr += ' AND a.currency = ?';
          params.push(query.filters.currency);
        }

        if (query.includeGeographic) {
          queryStr += ` GROUP BY a.account_type, a.currency, a.country, a.city ORDER BY total_balance DESC`;
        } else {
          queryStr += ` GROUP BY a.account_type, a.currency ORDER BY total_balance DESC`;
        }

        // Add pagination
        const offset = (query.page - 1) * query.limit;
        queryStr += ` LIMIT ? OFFSET ?`;
        params.push(query.limit, offset);

        const [rows] = await connection.execute(queryStr, params);

        // Get total count
        let countQuery;
        if (query.includeGeographic) {
          countQuery = `SELECT COUNT(DISTINCT CONCAT(account_type, currency, country, city)) as total FROM accounts WHERE status = 'active'`;
        } else {
          countQuery = `SELECT COUNT(DISTINCT CONCAT(account_type, currency)) as total FROM accounts WHERE status = 'active'`;
        }

        const countParams = params.slice(0, -2);
        const [countResult] = await connection.execute(countQuery, countParams);
        const total = countResult[0].total;

        return {
          data: rows,
          pagination: {
            page: query.page,
            limit: query.limit,
            total,
            totalPages: Math.ceil(total / query.limit)
          }
        };
      });

      result = {
        accounts: data.data,
        pagination: data.pagination,
        metadata: {
          queryId: query.queryId,
          metrics: query.metrics,
          includeGeographic: query.includeGeographic,
          dateRange: { startDate: query.startDate, endDate: query.endDate },
          generatedAt: new Date().toISOString()
        }
      };

      this.cache.set(cacheKey, result);
      setTimeout(() => this.cache.delete(cacheKey), 5 * 60 * 1000);
    }

    this.logger.info('Account analytics retrieved successfully', {
      queryId: query.queryId,
      recordCount: result.accounts.length
    });

    return result;
  }

  async handleGetAnalyticsDashboard(query) {
    const cacheKey = `dashboard:${query.dashboardId}:${query.includeData}:${JSON.stringify(query.filters)}`;

    let dashboard = this.cache.get(cacheKey);

    if (!dashboard) {
      const result = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute('SELECT * FROM analytics_dashboards WHERE id = ?', [query.dashboardId]);
        return rows[0];
      });

      if (!result) {
        throw new Error('Dashboard not found');
      }

      // Parse JSON fields
      dashboard = {
        id: result.id,
        name: result.name,
        description: result.description,
        widgets: JSON.parse(result.widgets || '[]'),
        filters: JSON.parse(result.filters || '{}'),
        refreshInterval: result.refresh_interval,
        createdBy: result.created_by,
        createdAt: result.created_at,
        updatedAt: result.updated_at,
        metadata: JSON.parse(result.metadata || '{}')
      };

      // If data is requested, populate widget data
      if (query.includeData) {
        for (const widget of dashboard.widgets) {
          widget.data = await this.getWidgetData(widget, { ...dashboard.filters, ...query.filters });
        }
      }

      // Cache for dashboard refresh interval or 5 minutes minimum
      const cacheTime = Math.max(dashboard.refreshInterval * 1000, 5 * 60 * 1000);
      this.cache.set(cacheKey, dashboard);
      setTimeout(() => this.cache.delete(cacheKey), cacheTime);
    }

    this.logger.info('Analytics dashboard retrieved successfully', {
      dashboardId: query.dashboardId,
      includeData: query.includeData
    });

    return dashboard;
  }

  async handleGetAnalyticsDashboards(query) {
    const data = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      let queryStr = `SELECT * FROM analytics_dashboards WHERE 1=1`;
      const params = [];

      // Apply filters
      if (query.filters.createdBy) {
        queryStr += ' AND created_by = ?';
        params.push(query.filters.createdBy);
      }

      if (query.filters.name) {
        queryStr += ' AND name LIKE ?';
        params.push(`%${query.filters.name}%`);
      }

      // Add sorting
      const sortField = query.sortBy === 'updated_at' ? 'updated_at' : 'created_at';
      const sortOrder = query.sortOrder === 'asc' ? 'ASC' : 'DESC';
      queryStr += ` ORDER BY ${sortField} ${sortOrder}`;

      // Add pagination
      const offset = (query.page - 1) * query.limit;
      queryStr += ` LIMIT ? OFFSET ?`;
      params.push(query.limit, offset);

      const [rows] = await connection.execute(queryStr, params);

      // Parse JSON fields
      const dashboards = rows.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        widgets: JSON.parse(row.widgets || '[]'),
        filters: JSON.parse(row.filters || '{}'),
        refreshInterval: row.refresh_interval,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        metadata: JSON.parse(row.metadata || '{}')
      }));

      // Get total count
      const countQuery = `SELECT COUNT(*) as total FROM analytics_dashboards WHERE 1=1`;
      const countParams = params.slice(0, -2);
      if (query.filters.createdBy) {
        countQuery += ' AND created_by = ?';
      }
      if (query.filters.name) {
        countQuery += ' AND name LIKE ?';
      }

      const [countResult] = await connection.execute(countQuery, countParams);
      const total = countResult[0].total;

      return {
        dashboards,
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit)
        }
      };
    });

    this.logger.info('Analytics dashboards retrieved successfully', {
      recordCount: data.dashboards.length
    });

    return data;
  }

  async handleGetAnalyticsReport(query) {
    const cacheKey = `report:${query.reportId}`;

    let report = this.cache.get(cacheKey);

    if (!report) {
      const result = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute('SELECT * FROM analytics_reports WHERE id = ?', [query.reportId]);
        return rows[0];
      });

      if (!result) {
        throw new Error('Report not found');
      }

      report = {
        id: result.id,
        reportType: result.report_type,
        parameters: JSON.parse(result.parameters || '{}'),
        filters: JSON.parse(result.filters || '{}'),
        generatedBy: result.generated_by,
        createdAt: result.created_at,
        updatedAt: result.updated_at
      };

      if (query.includeData) {
        report.data = JSON.parse(result.data || '{}');
      }

      // Cache for 10 minutes
      this.cache.set(cacheKey, report);
      setTimeout(() => this.cache.delete(cacheKey), 10 * 60 * 1000);
    }

    this.logger.info('Analytics report retrieved successfully', {
      reportId: query.reportId,
      includeData: query.includeData
    });

    return report;
  }

  async handleGetAnalyticsMetrics(query) {
    const cacheKey = `metrics:${query.metricType}:${query.timeRange}:${query.realTime}`;

    let metrics = this.cache.get(cacheKey);

    if (!metrics) {
      // Calculate metrics based on type and time range
      metrics = await this.calculateMetrics(query.metricType, query.timeRange, query.filters);

      // Cache for 1 minute for real-time, 5 minutes for historical
      const cacheTime = query.realTime ? 60 * 1000 : 5 * 60 * 1000;
      this.cache.set(cacheKey, metrics);
      setTimeout(() => this.cache.delete(cacheKey), cacheTime);
    }

    this.logger.info('Analytics metrics retrieved successfully', {
      metricType: query.metricType,
      timeRange: query.timeRange,
      realTime: query.realTime
    });

    return metrics;
  }

  // Helper methods
  getDateFormat(groupBy) {
    switch (groupBy) {
      case 'hour': return '%Y-%m-%d %H:00:00';
      case 'day': return '%Y-%m-%d';
      case 'week': return '%Y-%u';
      case 'month': return '%Y-%m';
      case 'quarter': return '%Y-%Q';
      case 'year': return '%Y';
      default: return '%Y-%m-%d';
    }
  }

  async getWidgetData(widget, filters) {
    // Generate data for dashboard widgets based on their configuration
    switch (widget.type) {
      case 'metric':
        return await this.getMetricWidgetData(widget, filters);
      case 'chart':
        return await this.getChartWidgetData(widget, filters);
      case 'table':
        return await this.getTableWidgetData(widget, filters);
      case 'heatmap':
        return await this.getHeatmapWidgetData(widget, filters);
      default:
        return null;
    }
  }

  async calculateMetrics(metricType, timeRange, filters) {
    // Calculate various metrics based on type and time range
    const now = new Date();
    const timeRangeMap = {
      '1h': 1 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      '90d': 90 * 24 * 60 * 60 * 1000,
      '1y': 365 * 24 * 60 * 60 * 1000
    };

    const startDate = new Date(now.getTime() - timeRangeMap[timeRange]);

    const metrics = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const params = [startDate];

      let query = `
        SELECT
          COUNT(DISTINCT at.account_id) as active_users,
          COUNT(*) as total_transactions,
          COALESCE(SUM(at.amount), 0) as total_volume,
          AVG(at.amount) as average_transaction,
          COUNT(DISTINCT DATE_FORMAT(at.created_at, '%Y-%m-%d')) as active_days
        FROM account_transactions at
        WHERE at.created_at >= ?
      `;

      const [result] = await connection.execute(query, params);

      return {
        activeUsers: result[0].active_users,
        totalTransactions: result[0].total_transactions,
        totalVolume: result[0].total_volume,
        averageTransaction: result[0].average_transaction,
        activeDays: result[0].active_days,
        timeRange,
        calculatedAt: new Date().toISOString()
      };
    });

    return metrics;
  }

  // Placeholder implementations for widget data
  async getMetricWidgetData(widget, filters) { return { value: 0, trend: 0 }; }
  async getChartWidgetData(widget, filters) { return { labels: [], datasets: [] }; }
  async getTableWidgetData(widget, filters) { return { headers: [], rows: [] }; }
  async getHeatmapWidgetData(widget, filters) { return { data: [] }; }
}