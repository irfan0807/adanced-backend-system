import {
  GetReportQuery,
  GetReportsQuery,
  GetScheduledReportsQuery,
  GetReportTemplatesQuery,
  GetReportAnalyticsQuery,
  GetDashboardQuery,
  GetDashboardsQuery,
  GetCachedReportDataQuery,
  GetDataSourcesQuery,
  GetReportExecutionHistoryQuery,
  GetReportMetricsQuery,
  GetRealTimeDataQuery,
  GetReportTemplateUsageQuery
} from '../queries/reporting-queries.js';

export class ReportingQueryHandler {
  constructor(dependencies) {
    this.connectionPool = dependencies.connectionPool;
    this.cache = dependencies.cache || new Map();
    this.logger = dependencies.logger;
  }

  async handle(query) {
    try {
      query.validate();

      switch (query.constructor.name) {
        case 'GetReportQuery':
          return await this.handleGetReport(query);
        case 'GetReportsQuery':
          return await this.handleGetReports(query);
        case 'GetScheduledReportsQuery':
          return await this.handleGetScheduledReports(query);
        case 'GetReportTemplatesQuery':
          return await this.handleGetReportTemplates(query);
        case 'GetReportAnalyticsQuery':
          return await this.handleGetReportAnalytics(query);
        case 'GetDashboardQuery':
          return await this.handleGetDashboard(query);
        case 'GetDashboardsQuery':
          return await this.handleGetDashboards(query);
        case 'GetCachedReportDataQuery':
          return await this.handleGetCachedReportData(query);
        case 'GetDataSourcesQuery':
          return await this.handleGetDataSources(query);
        case 'GetReportExecutionHistoryQuery':
          return await this.handleGetReportExecutionHistory(query);
        case 'GetReportMetricsQuery':
          return await this.handleGetReportMetrics(query);
        case 'GetRealTimeDataQuery':
          return await this.handleGetRealTimeData(query);
        case 'GetReportTemplateUsageQuery':
          return await this.handleGetReportTemplateUsage(query);
        default:
          throw new Error(`Unknown query type: ${query.constructor.name}`);
      }
    } catch (error) {
      this.logger.error(`Error handling query ${query.constructor.name}:`, error);
      throw error;
    }
  }

  async handleGetReport(query) {
    const report = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT * FROM reports WHERE id = ?',
        [query.reportId]
      );
      return rows[0];
    });

    if (!report) {
      return null;
    }

    // Parse JSON fields
    const parsedReport = {
      ...report,
      parameters: JSON.parse(report.parameters || '{}'),
      data: query.includeData ? JSON.parse(report.data || 'null') : undefined,
      metadata: JSON.parse(report.metadata || '{}')
    };

    return parsedReport;
  }

  async handleGetReports(query) {
    let whereClause = '1=1';
    const params = [];

    // Build filters
    if (query.filters.reportType) {
      whereClause += ' AND report_type = ?';
      params.push(query.filters.reportType);
    }

    if (query.filters.generatedBy) {
      whereClause += ' AND generated_by = ?';
      params.push(query.filters.generatedBy);
    }

    if (query.dateRange.startDate) {
      whereClause += ' AND created_at >= ?';
      params.push(query.dateRange.startDate);
    }

    if (query.dateRange.endDate) {
      whereClause += ' AND created_at <= ?';
      params.push(query.dateRange.endDate);
    }

    // Build order clause
    const orderClause = `ORDER BY ${query.sortBy} ${query.sortOrder}`;

    // Build limit clause
    const limitClause = `LIMIT ${query.offset}, ${query.limit}`;

    const reports = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT * FROM reports WHERE ${whereClause} ${orderClause} ${limitClause}`,
        params
      );
      return rows;
    });

    // Get total count
    const totalCount = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT COUNT(*) as count FROM reports WHERE ${whereClause}`,
        params
      );
      return rows[0].count;
    });

    // Parse JSON fields
    const parsedReports = reports.map(report => ({
      ...report,
      parameters: JSON.parse(report.parameters || '{}'),
      data: query.includeData ? JSON.parse(report.data || 'null') : undefined,
      metadata: JSON.parse(report.metadata || '{}')
    }));

    return {
      reports: parsedReports,
      totalCount,
      hasMore: (query.offset + query.limit) < totalCount
    };
  }

  async handleGetScheduledReports(query) {
    let whereClause = '1=1';
    const params = [];

    // Build filters
    if (query.status === 'active') {
      whereClause += ' AND is_active = true';
    } else if (query.status === 'inactive') {
      whereClause += ' AND is_active = false';
    }

    if (query.filters.reportType) {
      whereClause += ' AND report_type = ?';
      params.push(query.filters.reportType);
    }

    if (query.filters.createdBy) {
      whereClause += ' AND created_by = ?';
      params.push(query.filters.createdBy);
    }

    // Build order clause
    const orderClause = `ORDER BY ${query.sortBy} ${query.sortOrder}`;

    // Build limit clause
    const limitClause = `LIMIT ${query.offset}, ${query.limit}`;

    const scheduledReports = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT * FROM scheduled_reports WHERE ${whereClause} ${orderClause} ${limitClause}`,
        params
      );
      return rows;
    });

    // Get total count
    const totalCount = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT COUNT(*) as count FROM scheduled_reports WHERE ${whereClause}`,
        params
      );
      return rows[0].count;
    });

    // Parse JSON fields and include execution history if requested
    const parsedReports = await Promise.all(scheduledReports.map(async (report) => {
      const parsed = {
        ...report,
        parameters: JSON.parse(report.parameters || '{}'),
        recipients: JSON.parse(report.recipients || '[]'),
        metadata: JSON.parse(report.metadata || '{}')
      };

      if (query.includeExecutionHistory) {
        parsed.executionHistory = await this.getScheduledReportExecutionHistory(report.id, 10);
      }

      return parsed;
    }));

    return {
      scheduledReports: parsedReports,
      totalCount,
      hasMore: (query.offset + query.limit) < totalCount
    };
  }

  async handleGetReportTemplates(query) {
    let whereClause = '1=1';
    const params = [];

    // Build filters
    if (query.isPublic !== undefined) {
      whereClause += ' AND is_public = ?';
      params.push(query.isPublic);
    }

    if (query.userId) {
      whereClause += ' AND (created_by = ? OR is_public = true)';
      params.push(query.userId);
    }

    if (query.reportType) {
      whereClause += ' AND report_type = ?';
      params.push(query.reportType);
    }

    if (query.search) {
      whereClause += ' AND (name LIKE ? OR description LIKE ?)';
      params.push(`%${query.search}%`, `%${query.search}%`);
    }

    if (query.tags && query.tags.length > 0) {
      whereClause += ' AND JSON_CONTAINS(tags, ?)';
      params.push(JSON.stringify(query.tags));
    }

    // Build order clause
    const orderClause = `ORDER BY ${query.sortBy} ${query.sortOrder}`;

    // Build limit clause
    const limitClause = `LIMIT ${query.offset}, ${query.limit}`;

    const templates = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT * FROM report_templates WHERE ${whereClause} ${orderClause} ${limitClause}`,
        params
      );
      return rows;
    });

    // Get total count
    const totalCount = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT COUNT(*) as count FROM report_templates WHERE ${whereClause}`,
        params
      );
      return rows[0].count;
    });

    // Parse JSON fields
    const parsedTemplates = templates.map(template => ({
      ...template,
      template: JSON.parse(template.template || '{}'),
      parameters: JSON.parse(template.parameters || '{}'),
      filters: JSON.parse(template.filters || '[]'),
      visualizations: JSON.parse(template.visualizations || '[]'),
      tags: JSON.parse(template.tags || '[]'),
      metadata: JSON.parse(template.metadata || '{}')
    }));

    return {
      templates: parsedTemplates,
      totalCount,
      hasMore: (query.offset + query.limit) < totalCount
    };
  }

  async handleGetReportAnalytics(query) {
    let whereClause = '1=1';
    const params = [];

    // Build filters
    if (query.reportId) {
      whereClause += ' AND report_id = ?';
      params.push(query.reportId);
    }

    if (query.userId) {
      whereClause += ' AND user_id = ?';
      params.push(query.userId);
    }

    if (query.dateRange.startDate) {
      whereClause += ' AND timestamp >= ?';
      params.push(query.dateRange.startDate);
    }

    if (query.dateRange.endDate) {
      whereClause += ' AND timestamp <= ?';
      params.push(query.dateRange.endDate);
    }

    // Get analytics data
    const analytics = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT
          DATE(timestamp) as date,
          action,
          COUNT(*) as count,
          AVG(duration) as avg_duration,
          SUM(CASE WHEN action = 'generated' THEN 1 ELSE 0 END) as generations,
          SUM(CASE WHEN action = 'viewed' THEN 1 ELSE 0 END) as views,
          SUM(CASE WHEN action = 'downloaded' THEN 1 ELSE 0 END) as downloads
        FROM report_analytics
        WHERE ${whereClause}
        GROUP BY DATE(timestamp), action
        ORDER BY date ${query.groupBy === 'week' ? ', WEEK(timestamp)' : ''} ${query.groupBy === 'month' ? ', MONTH(timestamp)' : ''}`,
        params
      );
      return rows;
    });

    // Aggregate by group
    const aggregatedData = this.aggregateAnalyticsByGroup(analytics, query.groupBy);

    // Calculate summary metrics
    const summary = {
      totalViews: aggregatedData.reduce((sum, item) => sum + (item.views || 0), 0),
      totalDownloads: aggregatedData.reduce((sum, item) => sum + (item.downloads || 0), 0),
      totalGenerations: aggregatedData.reduce((sum, item) => sum + (item.generations || 0), 0),
      averageGenerationTime: this.calculateAverageGenerationTime(analytics),
      mostPopularReport: await this.getMostPopularReport(query.dateRange)
    };

    return {
      summary,
      data: aggregatedData
    };
  }

  async handleGetDashboard(query) {
    const dashboard = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT * FROM dashboards WHERE id = ?',
        [query.dashboardId]
      );
      return rows[0];
    });

    if (!dashboard) {
      return null;
    }

    // Parse JSON fields
    const parsedDashboard = {
      ...dashboard,
      widgets: JSON.parse(dashboard.widgets || '[]'),
      layout: JSON.parse(dashboard.layout || '{}'),
      filters: JSON.parse(dashboard.filters || '{}'),
      tags: JSON.parse(dashboard.tags || '[]'),
      metadata: JSON.parse(dashboard.metadata || '{}')
    };

    // Refresh data if requested
    if (query.refreshData) {
      parsedDashboard.widgetData = await this.refreshDashboardWidgetData(parsedDashboard.widgets);
    }

    return parsedDashboard;
  }

  async handleGetDashboards(query) {
    let whereClause = '1=1';
    const params = [];

    // Build filters
    if (query.isPublic !== undefined) {
      whereClause += ' AND is_public = ?';
      params.push(query.isPublic);
    }

    if (query.userId) {
      whereClause += ' AND (created_by = ? OR is_public = true)';
      params.push(query.userId);
    }

    if (query.search) {
      whereClause += ' AND (name LIKE ? OR description LIKE ?)';
      params.push(`%${query.search}%`, `%%${query.search}%`);
    }

    if (query.tags && query.tags.length > 0) {
      whereClause += ' AND JSON_CONTAINS(tags, ?)';
      params.push(JSON.stringify(query.tags));
    }

    // Build order clause
    const orderClause = `ORDER BY ${query.sortBy} ${query.sortOrder}`;

    // Build limit clause
    const limitClause = `LIMIT ${query.offset}, ${query.limit}`;

    const dashboards = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT * FROM dashboards WHERE ${whereClause} ${orderClause} ${limitClause}`,
        params
      );
      return rows;
    });

    // Get total count
    const totalCount = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT COUNT(*) as count FROM dashboards WHERE ${whereClause}`,
        params
      );
      return rows[0].count;
    });

    // Parse JSON fields
    const parsedDashboards = dashboards.map(dashboard => ({
      ...dashboard,
      widgets: JSON.parse(dashboard.widgets || '[]'),
      layout: JSON.parse(dashboard.layout || '{}'),
      filters: JSON.parse(dashboard.filters || '{}'),
      tags: JSON.parse(dashboard.tags || '[]'),
      metadata: JSON.parse(dashboard.metadata || '{}')
    }));

    return {
      dashboards: parsedDashboards,
      totalCount,
      hasMore: (query.offset + query.limit) < totalCount
    };
  }

  async handleGetCachedReportData(query) {
    // Try cache first
    let cachedData = null;
    if (query.cacheKey) {
      cachedData = this.cache.get(query.cacheKey);
    } else if (query.reportType) {
      const cacheKey = `${query.reportType}:${JSON.stringify(query.parameters)}`;
      cachedData = this.cache.get(cacheKey);
    }

    if (cachedData && (!cachedData.expiresAt || new Date(cachedData.expiresAt) > new Date() || query.allowStale)) {
      return cachedData.data;
    }

    // Fallback to database
    if (query.cacheKey) {
      const dbCache = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute(
          'SELECT * FROM report_cache WHERE cache_key = ? AND (expires_at IS NULL OR expires_at > NOW())',
          [query.cacheKey]
        );
        return rows[0];
      });

      if (dbCache) {
        const data = JSON.parse(dbCache.data);
        // Update cache
        this.cache.set(query.cacheKey, {
          data,
          expiresAt: dbCache.expires_at,
          createdAt: dbCache.created_at
        });
        return data;
      }
    }

    return null;
  }

  async handleGetDataSources(query) {
    let whereClause = '1=1';
    const params = [];

    // Build filters
    if (query.status === 'connected') {
      whereClause += ' AND status = "connected"';
    } else if (query.status === 'disconnected') {
      whereClause += ' AND status = "disconnected"';
    }

    if (query.type) {
      whereClause += ' AND type = ?';
      params.push(query.type);
    }

    // Build order clause
    const orderClause = `ORDER BY ${query.sortBy} ${query.sortOrder}`;

    // Build limit clause
    const limitClause = `LIMIT ${query.offset}, ${query.limit}`;

    const dataSources = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT * FROM data_sources WHERE ${whereClause} ${orderClause} ${limitClause}`,
        params
      );
      return rows;
    });

    // Get total count
    const totalCount = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT COUNT(*) as count FROM data_sources WHERE ${whereClause}`,
        params
      );
      return rows[0].count;
    });

    // Parse JSON fields and mask sensitive data
    const parsedDataSources = dataSources.map(ds => ({
      ...ds,
      configuration: JSON.parse(ds.configuration || '{}'),
      // Mask connection strings
      connectionString: this.maskConnectionString(ds.connection_string),
      metadata: JSON.parse(ds.metadata || '{}')
    }));

    return {
      dataSources: parsedDataSources,
      totalCount,
      hasMore: (query.offset + query.limit) < totalCount
    };
  }

  async handleGetReportExecutionHistory(query) {
    let whereClause = '1=1';
    const params = [];

    // Build filters
    if (query.reportId) {
      whereClause += ' AND report_id = ?';
      params.push(query.reportId);
    }

    if (query.scheduledReportId) {
      whereClause += ' AND scheduled_report_id = ?';
      params.push(query.scheduledReportId);
    }

    if (query.status) {
      whereClause += ' AND status = ?';
      params.push(query.status);
    }

    if (query.dateRange.startDate) {
      whereClause += ' AND executed_at >= ?';
      params.push(query.dateRange.startDate);
    }

    if (query.dateRange.endDate) {
      whereClause += ' AND executed_at <= ?';
      params.push(query.dateRange.endDate);
    }

    // Build order clause
    const orderClause = `ORDER BY ${query.sortBy} ${query.sortOrder}`;

    // Build limit clause
    const limitClause = `LIMIT ${query.offset}, ${query.limit}`;

    const executions = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT * FROM report_executions WHERE ${whereClause} ${orderClause} ${limitClause}`,
        params
      );
      return rows;
    });

    // Get total count
    const totalCount = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT COUNT(*) as count FROM report_executions WHERE ${whereClause}`,
        params
      );
      return rows[0].count;
    });

    // Parse JSON fields
    const parsedExecutions = executions.map(execution => ({
      ...execution,
      parameters: JSON.parse(execution.parameters || '{}'),
      result: JSON.parse(execution.result || 'null'),
      error_details: JSON.parse(execution.error_details || 'null'),
      metadata: JSON.parse(execution.metadata || '{}')
    }));

    return {
      executions: parsedExecutions,
      totalCount,
      hasMore: (query.offset + query.limit) < totalCount
    };
  }

  async handleGetReportMetrics(query) {
    const metrics = {};

    for (const metric of query.metrics) {
      switch (metric) {
        case 'totalReports':
          metrics.totalReports = await this.getTotalReportsMetric(query.dateRange, query.groupBy);
          break;
        case 'avgExecutionTime':
          metrics.avgExecutionTime = await this.getAverageExecutionTimeMetric(query.dateRange, query.groupBy);
          break;
        case 'successRate':
          metrics.successRate = await this.getSuccessRateMetric(query.dateRange, query.groupBy);
          break;
        case 'totalUsers':
          metrics.totalUsers = await this.getTotalUsersMetric(query.dateRange, query.groupBy);
          break;
        case 'mostUsedReportType':
          metrics.mostUsedReportType = await this.getMostUsedReportTypeMetric(query.dateRange);
          break;
        case 'peakUsageHours':
          metrics.peakUsageHours = await this.getPeakUsageHoursMetric(query.dateRange);
          break;
        case 'dataVolume':
          metrics.dataVolume = await this.getDataVolumeMetric(query.dateRange, query.groupBy);
          break;
      }
    }

    return {
      period: query.dateRange,
      groupBy: query.groupBy,
      generatedAt: new Date().toISOString(),
      metrics
    };
  }

  async handleGetRealTimeData(query) {
    // Execute real-time query against the specified data source
    const dataSource = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT * FROM data_sources WHERE id = ? AND status = "connected"',
        [query.dataSource]
      );
      return rows[0];
    });

    if (!dataSource) {
      throw new Error('Data source not found or not connected');
    }

    // Execute query based on data source type
    let result;
    switch (dataSource.type) {
      case 'mysql':
        result = await this.executeMySQLQuery(dataSource, query);
        break;
      case 'mongodb':
        result = await this.executeMongoQuery(dataSource, query);
        break;
      case 'elasticsearch':
        result = await this.executeElasticsearchQuery(dataSource, query);
        break;
      default:
        throw new Error(`Unsupported data source type: ${dataSource.type}`);
    }

    // Apply sorting and limiting
    if (query.sortBy) {
      result.data.sort((a, b) => {
        const aVal = a[query.sortBy];
        const bVal = b[query.sortBy];
        const modifier = query.sortOrder === 'desc' ? -1 : 1;
        return (aVal > bVal ? 1 : aVal < bVal ? -1 : 0) * modifier;
      });
    }

    if (result.data.length > query.limit) {
      result.data = result.data.slice(0, query.limit);
    }

    return {
      dataSource: query.dataSource,
      query: query.query,
      executionTime: result.executionTime,
      recordCount: result.data.length,
      data: result.data,
      metadata: query.includeMetadata ? result.metadata : undefined
    };
  }

  async handleGetReportTemplateUsage(query) {
    const usage = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(`
        SELECT
          DATE(created_at) as date,
          COUNT(*) as usage_count
        FROM reports
        WHERE template_id = ?
          AND created_at BETWEEN ? AND ?
        GROUP BY DATE(created_at)
        ORDER BY date ${query.groupBy === 'week' ? ', WEEK(created_at)' : ''} ${query.groupBy === 'month' ? ', MONTH(created_at)' : ''}
      `, [query.templateId, query.dateRange.startDate, query.dateRange.endDate]);
      return rows;
    });

    let users = [];
    if (query.includeUsers) {
      users = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute(`
          SELECT
            generated_by as user_id,
            COUNT(*) as usage_count,
            MAX(created_at) as last_used
          FROM reports
          WHERE template_id = ?
            AND created_at BETWEEN ? AND ?
          GROUP BY generated_by
          ORDER BY usage_count DESC
          LIMIT ?
        `, [query.templateId, query.dateRange.startDate, query.dateRange.endDate, query.limit]);
        return rows;
      });
    }

    return {
      templateId: query.templateId,
      period: query.dateRange,
      totalUsage: usage.reduce((sum, day) => sum + day.usage_count, 0),
      usageByPeriod: usage,
      topUsers: users
    };
  }

  // Helper methods
  async getScheduledReportExecutionHistory(scheduledReportId, limit = 10) {
    const executions = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT * FROM report_executions WHERE scheduled_report_id = ? ORDER BY executed_at DESC LIMIT ?',
        [scheduledReportId, limit]
      );
      return rows;
    });

    return executions.map(execution => ({
      ...execution,
      parameters: JSON.parse(execution.parameters || '{}'),
      result: JSON.parse(execution.result || 'null'),
      error_details: JSON.parse(execution.error_details || 'null')
    }));
  }

  aggregateAnalyticsByGroup(analytics, groupBy) {
    const grouped = {};

    analytics.forEach(item => {
      let key;
      switch (groupBy) {
        case 'week':
          key = this.getWeekKey(new Date(item.date));
          break;
        case 'month':
          key = this.getMonthKey(new Date(item.date));
          break;
        default:
          key = item.date;
      }

      if (!grouped[key]) {
        grouped[key] = { period: key, views: 0, downloads: 0, generations: 0, avg_duration: 0 };
      }

      grouped[key].views += item.views || 0;
      grouped[key].downloads += item.downloads || 0;
      grouped[key].generations += item.generations || 0;
      grouped[key].avg_duration = Math.max(grouped[key].avg_duration, item.avg_duration || 0);
    });

    return Object.values(grouped);
  }

  calculateAverageGenerationTime(analytics) {
    const generationTimes = analytics
      .filter(item => item.action === 'generated' && item.avg_duration)
      .map(item => item.avg_duration);

    return generationTimes.length > 0
      ? generationTimes.reduce((sum, time) => sum + time, 0) / generationTimes.length
      : 0;
  }

  async getMostPopularReport(dateRange) {
    const result = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(`
        SELECT report_type, COUNT(*) as count
        FROM report_analytics
        WHERE action = 'generated'
          AND timestamp BETWEEN ? AND ?
        GROUP BY report_type
        ORDER BY count DESC
        LIMIT 1
      `, [dateRange.startDate, dateRange.endDate]);
      return rows[0];
    });

    return result || { report_type: 'none', count: 0 };
  }

  async refreshDashboardWidgetData(widgets) {
    const widgetData = {};

    for (const widget of widgets) {
      try {
        // Execute widget query
        const data = await this.executeWidgetQuery(widget);
        widgetData[widget.id] = {
          data,
          lastUpdated: new Date().toISOString(),
          status: 'success'
        };
      } catch (error) {
        widgetData[widget.id] = {
          error: error.message,
          lastUpdated: new Date().toISOString(),
          status: 'error'
        };
      }
    }

    return widgetData;
  }

  maskConnectionString(connectionString) {
    // Mask sensitive parts of connection strings
    return connectionString.replace(/:\/\/([^:]+):([^@]+)@/, '://***:***@');
  }

  getWeekKey(date) {
    const year = date.getFullYear();
    const week = Math.ceil((date - new Date(year, 0, 1)) / (7 * 24 * 60 * 60 * 1000));
    return `${year}-W${week.toString().padStart(2, '0')}`;
  }

  getMonthKey(date) {
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
  }

  // Metric calculation methods
  async getTotalReportsMetric(dateRange, groupBy) {
    // Implementation for total reports metric
    return {};
  }

  async getAverageExecutionTimeMetric(dateRange, groupBy) {
    // Implementation for average execution time metric
    return {};
  }

  async getSuccessRateMetric(dateRange, groupBy) {
    // Implementation for success rate metric
    return {};
  }

  async getTotalUsersMetric(dateRange, groupBy) {
    // Implementation for total users metric
    return {};
  }

  async getMostUsedReportTypeMetric(dateRange) {
    // Implementation for most used report type metric
    return {};
  }

  async getPeakUsageHoursMetric(dateRange) {
    // Implementation for peak usage hours metric
    return {};
  }

  async getDataVolumeMetric(dateRange, groupBy) {
    // Implementation for data volume metric
    return {};
  }

  // Data source query methods
  async executeMySQLQuery(dataSource, query) {
    // Implementation for MySQL queries
    return { data: [], executionTime: 0, metadata: {} };
  }

  async executeMongoQuery(dataSource, query) {
    try {
      const { collection, filter = {}, projection = {}, sort = {}, limit = 1000, aggregations } = query;
      const startTime = Date.now();

      const db = this.connectionPool.getMongoDatabase();
      let mongoCollection = db.collection(collection || dataSource.collection);

      let result;
      let total = 0;

      if (aggregations && aggregations.length > 0) {
        // Build aggregation pipeline
        const pipeline = [];

        // Add match stage if filters exist
        if (Object.keys(filter).length > 0) {
          pipeline.push({ $match: filter });
        }

        // Add group stage for aggregations
        const groupStage = { _id: null };
        aggregations.forEach(agg => {
          switch (agg.operation) {
            case 'count':
              groupStage[`${agg.alias || agg.field}_count`] = { $sum: 1 };
              break;
            case 'sum':
              groupStage[`${agg.alias || agg.field}_sum`] = { $sum: `$${agg.field}` };
              break;
            case 'avg':
              groupStage[`${agg.alias || agg.field}_avg`] = { $avg: `$${agg.field}` };
              break;
            case 'min':
              groupStage[`${agg.alias || agg.field}_min`] = { $min: `$${agg.field}` };
              break;
            case 'max':
              groupStage[`${agg.alias || agg.field}_max`] = { $max: `$${agg.field}` };
              break;
          }
        });
        pipeline.push({ $group: groupStage });

        result = await mongoCollection.aggregate(pipeline).toArray();
      } else {
        // Regular find query
        const cursor = mongoCollection.find(filter, { projection });

        if (Object.keys(sort).length > 0) {
          cursor.sort(sort);
        }

        cursor.limit(limit);
        result = await cursor.toArray();
        total = await mongoCollection.countDocuments(filter);
      }

      const executionTime = Date.now() - startTime;

      this.logger.info(`Executed MongoDB query on collection: ${collection}`, {
        filter,
        executionTime,
        resultCount: result.length
      });

      return {
        data: result,
        total: total || result.length,
        executionTime,
        metadata: {
          collection: collection || dataSource.collection,
          query: filter,
          aggregations: aggregations || []
        }
      };
    } catch (error) {
      this.logger.error('Error executing MongoDB query:', error);
      throw error;
    }
  }

  async executeElasticsearchQuery(dataSource, query) {
    // Implementation for Elasticsearch queries
    try {
      const { index, body = {}, size = 1000 } = query;

      // This would connect to Elasticsearch and execute the search
      // For now, return mock data structure
      const mockData = {
        data: [
          { _id: 'es-1', _source: { amount: 150.25, status: 'completed', timestamp: new Date() } },
          { _id: 'es-2', _source: { amount: 300.50, status: 'failed', timestamp: new Date() } }
        ],
        executionTime: Math.floor(Math.random() * 50) + 5,
        metadata: {
          totalHits: 2,
          index: index,
          query: body
        }
      };

      this.logger.info(`Executed Elasticsearch query on index: ${index}`, {
        body,
        executionTime: mockData.executionTime
      });

      return mockData;
    } catch (error) {
      this.logger.error('Error executing Elasticsearch query:', error);
      throw error;
    }
  }

  async executeWidgetQuery(widget) {
    // Implementation for widget queries
    try {
      const { type, dataSource, config = {} } = widget;

      let queryResult = [];

      switch (type) {
        case 'metric':
          queryResult = await this.executeMetricWidget(dataSource, config);
          break;
        case 'chart':
          queryResult = await this.executeChartWidget(dataSource, config);
          break;
        case 'table':
          queryResult = await this.executeTableWidget(dataSource, config);
          break;
        case 'kpi':
          queryResult = await this.executeKPIWidget(dataSource, config);
          break;
        default:
          this.logger.warn(`Unknown widget type: ${type}`);
          queryResult = [];
      }

      return queryResult;
    } catch (error) {
      this.logger.error('Error executing widget query:', error);
      throw error;
    }
  }

  async executeMetricWidget(dataSource, config) {
    const { metric, field, filters = {} } = config;

    // Build query based on data source
    let query;
    switch (dataSource) {
      case 'transactions':
        query = this.buildTransactionMetricQuery(metric, field, filters);
        break;
      case 'users':
        query = this.buildUserMetricQuery(metric, field, filters);
        break;
      case 'events':
        query = this.buildEventMetricQuery(metric, field, filters);
        break;
      default:
        return { value: 0, label: 'Unknown' };
    }

    // Execute query (simplified for demo)
    const result = await this.executeDataSourceQuery(dataSource, query);

    return {
      value: result.value || 0,
      label: config.label || `${metric} of ${field}`,
      format: config.format || 'number',
      trend: result.trend || 0
    };
  }

  async executeChartWidget(dataSource, config) {
    const { chartType, xAxis, yAxis, groupBy, filters = {} } = config;

    // Build aggregation query
    const query = {
      groupBy: groupBy || xAxis,
      aggregations: [{
        field: yAxis,
        operation: 'sum'
      }],
      filters,
      limit: 50
    };

    const result = await this.executeDataSourceQuery(dataSource, query);

    return {
      type: chartType,
      data: result.data || [],
      xAxis: xAxis,
      yAxis: yAxis,
      metadata: result.metadata || {}
    };
  }

  async executeTableWidget(dataSource, config) {
    const { columns = [], filters = {}, sort = {}, limit = 100 } = config;

    const query = {
      select: columns,
      filters,
      sort,
      limit
    };

    const result = await this.executeDataSourceQuery(dataSource, query);

    return {
      columns: columns,
      data: result.data || [],
      total: result.total || 0,
      metadata: result.metadata || {}
    };
  }

  async executeKPIWidget(dataSource, config) {
    const { kpi, period = 'current', compareTo = 'previous' } = config;

    // Get current period data
    const currentData = await this.getKPIData(dataSource, kpi, period);

    // Get comparison data
    const comparisonData = await this.getKPIData(dataSource, kpi, compareTo);

    const change = comparisonData.value !== 0 ?
      ((currentData.value - comparisonData.value) / comparisonData.value) * 100 : 0;

    return {
      value: currentData.value,
      change: parseFloat(change.toFixed(2)),
      trend: change > 0 ? 'up' : change < 0 ? 'down' : 'stable',
      period: period,
      comparisonPeriod: compareTo
    };
  }

  async getKPIData(dataSource, kpi, period) {
    // Simplified KPI calculation
    const mockKPIs = {
      'total_revenue': { current: 125000, previous: 115000 },
      'total_transactions': { current: 1250, previous: 1100 },
      'active_users': { current: 850, previous: 780 },
      'conversion_rate': { current: 3.2, previous: 2.8 }
    };

    const kpiData = mockKPIs[kpi] || { current: 0, previous: 0 };

    return {
      value: period === 'current' ? kpiData.current : kpiData.previous
    };
  }

  buildTransactionMetricQuery(metric, field, filters) {
    return {
      table: 'transactions',
      operation: metric,
      field: field,
      filters: {
        ...filters,
        status: 'completed'
      }
    };
  }

  buildUserMetricQuery(metric, field, filters) {
    return {
      table: 'users',
      operation: metric,
      field: field,
      filters: {
        ...filters,
        status: 'active'
      }
    };
  }

  buildEventMetricQuery(metric, field, filters) {
    return {
      table: 'events',
      operation: metric,
      field: field,
      filters: {
        ...filters,
        type: filters.eventType || 'all'
      }
    };
  }

  async executeDataSourceQuery(dataSource, query) {
    // Route to appropriate data source executor
    switch (dataSource) {
      case 'transactions':
      case 'users':
        return await this.executeSQLQuery(dataSource, query);
      case 'events':
        return await this.executeMongoQuery({ collection: dataSource }, query);
      case 'logs':
        return await this.executeElasticsearchQuery({ index: dataSource }, query);
      default:
        return { data: [], total: 0, metadata: {} };
    }
  }

  async executeSQLQuery(table, query) {
    try {
      const { operation, field, filters = {}, groupBy, limit = 1000, aggregations } = query;

      // Build SQL query dynamically
      let sql = `SELECT `;
      let params = [];
      let selectFields = [];

      // Handle aggregations if provided
      if (aggregations && aggregations.length > 0) {
        aggregations.forEach(agg => {
          switch (agg.operation) {
            case 'count':
              selectFields.push(`COUNT(${agg.field}) as ${agg.alias || agg.field}_count`);
              break;
            case 'sum':
              selectFields.push(`SUM(${agg.field}) as ${agg.alias || agg.field}_sum`);
              break;
            case 'avg':
              selectFields.push(`AVG(${agg.field}) as ${agg.alias || agg.field}_avg`);
              break;
            case 'min':
              selectFields.push(`MIN(${agg.field}) as ${agg.alias || agg.field}_min`);
              break;
            case 'max':
              selectFields.push(`MAX(${agg.field}) as ${agg.alias || agg.field}_max`);
              break;
            default:
              selectFields.push(agg.field);
          }
        });
        
        if (groupBy) {
          selectFields.unshift(groupBy);
        }
      } else if (operation && field) {
        // Legacy single operation format
        switch (operation) {
          case 'count':
            selectFields.push(`COUNT(${field}) as value`);
            break;
          case 'sum':
            selectFields.push(`SUM(${field}) as value`);
            break;
          case 'avg':
            selectFields.push(`AVG(${field}) as value`);
            break;
          case 'min':
            selectFields.push(`MIN(${field}) as value`);
            break;
          case 'max':
            selectFields.push(`MAX(${field}) as value`);
            break;
          default:
            selectFields.push('*');
        }
      } else {
        selectFields.push('*');
      }

      sql += selectFields.join(', ');
      sql += ` FROM ${table}`;

      // Add WHERE clause
      const whereConditions = [];
      for (const [key, value] of Object.entries(filters)) {
        if (value !== null && value !== undefined && value !== '') {
          whereConditions.push(`${key} = ?`);
          params.push(value);
        }
      }

      if (whereConditions.length > 0) {
        sql += ` WHERE ${whereConditions.join(' AND ')}`;
      }

      // Add GROUP BY
      if (groupBy) {
        sql += ` GROUP BY ${groupBy}`;
      }

      // Add ORDER BY for consistent results
      if (groupBy) {
        sql += ` ORDER BY ${groupBy}`;
      }

      // Add LIMIT
      sql += ` LIMIT ?`;
      params.push(limit);

      const result = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute(sql, params);
        return rows;
      });

      return {
        data: result,
        total: result.length,
        executionTime: Date.now(),
        metadata: { sql, params }
      };
    } catch (error) {
      this.logger.error('Error executing SQL query:', error);
      throw error;
    }
  }
}