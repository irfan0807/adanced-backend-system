import {
  GenerateAnalyticsReportCommand,
  UpdateAnalyticsDataCommand,
  RefreshAnalyticsCacheCommand,
  ExportAnalyticsDataCommand,
  CreateAnalyticsDashboardCommand,
  UpdateAnalyticsDashboardCommand
} from '../commands/analytics-commands.js';
import {
  AnalyticsReportGeneratedEvent,
  AnalyticsDataUpdatedEvent,
  AnalyticsCacheRefreshedEvent,
  AnalyticsDataExportedEvent,
  AnalyticsDashboardCreatedEvent,
  AnalyticsDashboardUpdatedEvent,
  AnalyticsMetricsCalculatedEvent,
  AnalyticsRealTimeUpdateEvent
} from '../events/analytics-events.js';

export class AnalyticsCommandHandler {
  constructor(dependencies) {
    this.connectionPool = dependencies.connectionPool;
    this.dualWriter = dependencies.dualWriter;
    this.eventStore = dependencies.eventStore;
    this.kafkaService = dependencies.kafkaService;
    this.cache = dependencies.cache || new Map();
    this.logger = dependencies.logger;
  }

  async handle(command) {
    try {
      command.validate();

      switch (command.constructor.name) {
        case 'GenerateAnalyticsReportCommand':
          return await this.handleGenerateAnalyticsReport(command);
        case 'UpdateAnalyticsDataCommand':
          return await this.handleUpdateAnalyticsData(command);
        case 'RefreshAnalyticsCacheCommand':
          return await this.handleRefreshAnalyticsCache(command);
        case 'ExportAnalyticsDataCommand':
          return await this.handleExportAnalyticsData(command);
        case 'CreateAnalyticsDashboardCommand':
          return await this.handleCreateAnalyticsDashboard(command);
        case 'UpdateAnalyticsDashboardCommand':
          return await this.handleUpdateAnalyticsDashboard(command);
        default:
          throw new Error(`Unknown command type: ${command.constructor.name}`);
      }
    } catch (error) {
      this.logger.error(`Error handling command ${command.constructor.name}:`, error);
      throw error;
    }
  }

  async handleGenerateAnalyticsReport(command) {
    const startTime = Date.now();

    try {
      let reportData;

      switch (command.reportType) {
        case 'transaction_summary':
          reportData = await this.generateTransactionSummaryReport(command.parameters, command.filters);
          break;
        case 'user_activity':
          reportData = await this.generateUserActivityReport(command.parameters, command.filters);
          break;
        case 'payment_methods':
          reportData = await this.generatePaymentMethodsReport(command.parameters, command.filters);
          break;
        case 'revenue':
          reportData = await this.generateRevenueReport(command.parameters, command.filters);
          break;
        case 'account_summary':
          reportData = await this.generateAccountSummaryReport(command.parameters, command.filters);
          break;
        default:
          throw new Error(`Unsupported report type: ${command.reportType}`);
      }

      // Store report in database
      const reportRecord = {
        id: command.reportId,
        report_type: command.reportType,
        parameters: JSON.stringify(command.parameters),
        filters: JSON.stringify(command.filters),
        data: JSON.stringify(reportData),
        generated_by: command.generatedBy,
        created_at: command.createdAt,
        updated_at: command.createdAt
      };

      await this.dualWriter.writeToAllDatabases(reportRecord, 'analytics_reports');

      // Cache the report
      this.cache.set(`report:${command.reportId}`, {
        ...reportRecord,
        data: reportData
      });

      // Publish event
      const event = new AnalyticsReportGeneratedEvent({
        reportId: command.reportId,
        reportType: command.reportType,
        parameters: command.parameters,
        filters: command.filters,
        data: reportData,
        generatedBy: command.generatedBy,
        metadata: {
          generationTime: Date.now() - startTime,
          dataPoints: this.countDataPoints(reportData)
        },
        timestamp: command.createdAt
      });

      await this.eventStore.saveEvent(event);
      await this.kafkaService.produce('analytics-events', event);

      this.logger.info('Analytics report generated successfully', {
        reportId: command.reportId,
        reportType: command.reportType,
        generationTime: Date.now() - startTime
      });

      return {
        reportId: command.reportId,
        reportType: command.reportType,
        data: reportData,
        generatedAt: command.createdAt,
        generationTime: Date.now() - startTime
      };

    } catch (error) {
      this.logger.error('Failed to generate analytics report', {
        reportId: command.reportId,
        reportType: command.reportType,
        error: error.message
      });
      throw error;
    }
  }

  async handleUpdateAnalyticsData(command) {
    try {
      // Update analytics data based on the data type
      const changes = await this.updateAnalyticsDataByType(command.dataType, command.data, command.source);

      // Publish event
      const event = new AnalyticsDataUpdatedEvent({
        dataType: command.dataType,
        data: command.data,
        source: command.source,
        updatedBy: command.updatedBy,
        changes,
        metadata: command.metadata,
        timestamp: command.updatedAt
      });

      await this.eventStore.saveEvent(event);
      await this.kafkaService.produce('analytics-events', event);

      // Invalidate related caches
      this.invalidateRelatedCaches(command.dataType);

      // Trigger real-time update event
      const realtimeEvent = new AnalyticsRealTimeUpdateEvent({
        updateType: command.dataType,
        data: command.data,
        sourceEvent: event,
        affectedMetrics: this.getAffectedMetrics(command.dataType),
        metadata: command.metadata,
        timestamp: command.updatedAt
      });

      await this.kafkaService.produce('analytics-realtime', realtimeEvent);

      this.logger.info('Analytics data updated successfully', {
        dataType: command.dataType,
        source: command.source,
        changesCount: changes.length
      });

      return { dataType: command.dataType, changes, updatedAt: command.updatedAt };

    } catch (error) {
      this.logger.error('Failed to update analytics data', {
        dataType: command.dataType,
        error: error.message
      });
      throw error;
    }
  }

  async handleRefreshAnalyticsCache(command) {
    const startTime = Date.now();

    try {
      let affectedRecords = 0;

      if (command.cacheType === 'all') {
        affectedRecords = await this.refreshAllCaches();
      } else {
        affectedRecords = await this.refreshCacheByType(command.cacheType);
      }

      // Publish event
      const event = new AnalyticsCacheRefreshedEvent({
        cacheType: command.cacheType,
        forceRefresh: command.forceRefresh,
        refreshedBy: command.refreshedBy,
        affectedRecords,
        duration: Date.now() - startTime,
        metadata: command.metadata,
        timestamp: command.refreshedAt
      });

      await this.eventStore.saveEvent(event);
      await this.kafkaService.produce('analytics-events', event);

      this.logger.info('Analytics cache refreshed successfully', {
        cacheType: command.cacheType,
        affectedRecords,
        duration: Date.now() - startTime
      });

      return {
        cacheType: command.cacheType,
        affectedRecords,
        duration: Date.now() - startTime,
        refreshedAt: command.refreshedAt
      };

    } catch (error) {
      this.logger.error('Failed to refresh analytics cache', {
        cacheType: command.cacheType,
        error: error.message
      });
      throw error;
    }
  }

  async handleExportAnalyticsData(command) {
    try {
      // Get the report data
      const reportData = await this.getReportDataForExport(command.reportType, command.filters);

      // Format the data
      let exportData;
      let fileSize = 0;

      switch (command.format) {
        case 'json':
          exportData = JSON.stringify(reportData, null, 2);
          fileSize = Buffer.byteLength(exportData, 'utf8');
          break;
        case 'csv':
          exportData = this.convertToCSV(reportData);
          fileSize = Buffer.byteLength(exportData, 'utf8');
          break;
        case 'pdf':
          // For PDF, we'd use a library like puppeteer or pdfkit
          // For now, just return metadata
          exportData = { type: 'pdf', data: reportData };
          fileSize = this.estimatePDFSize(reportData);
          break;
        default:
          throw new Error(`Unsupported export format: ${command.format}`);
      }

      // Store export record
      const exportRecord = {
        id: command.exportId,
        report_type: command.reportType,
        format: command.format,
        filters: JSON.stringify(command.filters),
        file_size: fileSize,
        record_count: this.countDataPoints(reportData),
        exported_by: command.exportedBy,
        created_at: command.exportedAt,
        metadata: JSON.stringify(command.metadata)
      };

      await this.dualWriter.writeToAllDatabases(exportRecord, 'analytics_exports');

      // Publish event
      const event = new AnalyticsDataExportedEvent({
        exportId: command.exportId,
        reportType: command.reportType,
        format: command.format,
        filters: command.filters,
        fileSize,
        recordCount: exportRecord.record_count,
        exportedBy: command.exportedBy,
        metadata: command.metadata,
        timestamp: command.exportedAt
      });

      await this.eventStore.saveEvent(event);
      await this.kafkaService.produce('analytics-events', event);

      this.logger.info('Analytics data exported successfully', {
        exportId: command.exportId,
        reportType: command.reportType,
        format: command.format,
        fileSize
      });

      return {
        exportId: command.exportId,
        reportType: command.reportType,
        format: command.format,
        data: exportData,
        fileSize,
        exportedAt: command.exportedAt
      };

    } catch (error) {
      this.logger.error('Failed to export analytics data', {
        exportId: command.exportId,
        error: error.message
      });
      throw error;
    }
  }

  async handleCreateAnalyticsDashboard(command) {
    try {
      // Validate widgets
      for (const widget of command.widgets) {
        await this.validateWidgetConfiguration(widget);
      }

      const dashboardData = {
        id: command.dashboardId,
        name: command.name,
        description: command.description,
        widgets: JSON.stringify(command.widgets),
        filters: JSON.stringify(command.filters),
        refresh_interval: command.refreshInterval,
        created_by: command.createdBy,
        created_at: command.createdAt,
        updated_at: command.createdAt,
        metadata: JSON.stringify(command.metadata)
      };

      await this.dualWriter.writeToAllDatabases(dashboardData, 'analytics_dashboards');

      // Cache the dashboard
      this.cache.set(`dashboard:${command.dashboardId}`, {
        ...dashboardData,
        widgets: command.widgets,
        filters: command.filters,
        metadata: command.metadata
      });

      // Publish event
      const event = new AnalyticsDashboardCreatedEvent({
        dashboardId: command.dashboardId,
        name: command.name,
        description: command.description,
        widgets: command.widgets,
        filters: command.filters,
        refreshInterval: command.refreshInterval,
        createdBy: command.createdBy,
        metadata: command.metadata,
        timestamp: command.createdAt
      });

      await this.eventStore.saveEvent(event);
      await this.kafkaService.produce('analytics-events', event);

      this.logger.info('Analytics dashboard created successfully', {
        dashboardId: command.dashboardId,
        name: command.name
      });

      return {
        dashboardId: command.dashboardId,
        name: command.name,
        createdAt: command.createdAt
      };

    } catch (error) {
      this.logger.error('Failed to create analytics dashboard', {
        dashboardId: command.dashboardId,
        error: error.message
      });
      throw error;
    }
  }

  async handleUpdateAnalyticsDashboard(command) {
    try {
      // Get current dashboard
      const currentDashboard = await this.getDashboardById(command.dashboardId);
      if (!currentDashboard) {
        throw new Error('Dashboard not found');
      }

      const updates = { ...command.updates, updated_at: command.updatedAt };

      // If widgets are being updated, validate them
      if (updates.widgets) {
        for (const widget of updates.widgets) {
          await this.validateWidgetConfiguration(widget);
        }
        updates.widgets = JSON.stringify(updates.widgets);
      }

      if (updates.filters) {
        updates.filters = JSON.stringify(updates.filters);
      }

      if (updates.metadata) {
        updates.metadata = JSON.stringify(updates.metadata);
      }

      // Update in database
      await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const updateFields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
        const values = [...Object.values(updates), command.dashboardId];
        await connection.execute(
          `UPDATE analytics_dashboards SET ${updateFields} WHERE id = ?`,
          values
        );
      });

      // Update cache
      const updatedDashboard = { ...currentDashboard, ...command.updates };
      this.cache.set(`dashboard:${command.dashboardId}`, updatedDashboard);

      // Publish event
      const event = new AnalyticsDashboardUpdatedEvent({
        dashboardId: command.dashboardId,
        updates: command.updates,
        updatedBy: command.updatedBy,
        metadata: command.metadata,
        timestamp: command.updatedAt
      });

      await this.eventStore.saveEvent(event);
      await this.kafkaService.produce('analytics-events', event);

      this.logger.info('Analytics dashboard updated successfully', {
        dashboardId: command.dashboardId
      });

      return {
        dashboardId: command.dashboardId,
        updates: command.updates,
        updatedAt: command.updatedAt
      };

    } catch (error) {
      this.logger.error('Failed to update analytics dashboard', {
        dashboardId: command.dashboardId,
        error: error.message
      });
      throw error;
    }
  }

  // Helper methods
  async generateTransactionSummaryReport(parameters, filters) {
    // Implementation for generating transaction summary report
    const { startDate, endDate, groupBy = 'day' } = parameters;

    const result = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      let query = `
        SELECT
          DATE_FORMAT(created_at, '${this.getDateFormat(groupBy)}') as period,
          COUNT(*) as transaction_count,
          COALESCE(SUM(amount), 0) as total_volume,
          AVG(amount) as average_amount,
          MIN(amount) as min_amount,
          MAX(amount) as max_amount
        FROM account_transactions
        WHERE 1=1
      `;

      const params = [];

      if (startDate) {
        query += ' AND created_at >= ?';
        params.push(startDate);
      }

      if (endDate) {
        query += ' AND created_at <= ?';
        params.push(endDate);
      }

      query += ` GROUP BY period ORDER BY period DESC`;

      const [rows] = await connection.execute(query, params);
      return rows;
    });

    return {
      summary: result,
      metadata: {
        totalRecords: result.length,
        dateRange: { startDate, endDate },
        groupBy
      }
    };
  }

  async generateUserActivityReport(parameters, filters) {
    // Implementation for generating user activity report
    const { startDate, endDate, metric = 'transactions', groupBy = 'day' } = parameters;

    // This would aggregate user activity based on the metric
    const result = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      let query;

      switch (metric) {
        case 'transactions':
          query = `
            SELECT
              DATE_FORMAT(at.created_at, '${this.getDateFormat(groupBy)}') as period,
              COUNT(DISTINCT at.account_id) as active_users,
              COUNT(*) as total_transactions,
              AVG(at.amount) as average_transaction_amount
            FROM account_transactions at
            WHERE 1=1
          `;
          break;
        case 'accounts_created':
          query = `
            SELECT
              DATE_FORMAT(created_at, '${this.getDateFormat(groupBy)}') as period,
              COUNT(*) as accounts_created
            FROM accounts
            WHERE 1=1
          `;
          break;
        default:
          throw new Error(`Unsupported metric: ${metric}`);
      }

      const params = [];

      if (startDate) {
        query += ' AND created_at >= ?';
        params.push(startDate);
      }

      if (endDate) {
        query += ' AND created_at <= ?';
        params.push(endDate);
      }

      query += ` GROUP BY period ORDER BY period DESC`;

      const [rows] = await connection.execute(query, params);
      return rows;
    });

    return {
      activity: result,
      metadata: {
        metric,
        totalRecords: result.length,
        dateRange: { startDate, endDate },
        groupBy
      }
    };
  }

  async generatePaymentMethodsReport(parameters, filters) {
    // Implementation for generating payment methods report
    const { startDate, endDate } = parameters;

    const result = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const query = `
        SELECT
          payment_method,
          COUNT(*) as transaction_count,
          COALESCE(SUM(amount), 0) as total_volume,
          AVG(amount) as average_amount,
          COUNT(DISTINCT account_id) as unique_users
        FROM payments
        WHERE 1=1
      `;

      const params = [];

      if (startDate) {
        query += ' AND created_at >= ?';
        params.push(startDate);
      }

      if (endDate) {
        query += ' AND created_at <= ?';
        params.push(endDate);
      }

      query += ` GROUP BY payment_method ORDER BY total_volume DESC`;

      const [rows] = await connection.execute(query, params);
      return rows;
    });

    return {
      paymentMethods: result,
      metadata: {
        totalRecords: result.length,
        dateRange: { startDate, endDate }
      }
    };
  }

  async generateRevenueReport(parameters, filters) {
    // Implementation for generating revenue report
    const { startDate, endDate, groupBy = 'month' } = parameters;

    const result = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const query = `
        SELECT
          DATE_FORMAT(created_at, '${this.getDateFormat(groupBy)}') as period,
          COALESCE(SUM(amount), 0) as total_revenue,
          COALESCE(SUM(fee_amount), 0) as total_fees,
          COUNT(*) as transaction_count
        FROM payments
        WHERE status = 'completed'
      `;

      const params = [];

      if (startDate) {
        query += ' AND created_at >= ?';
        params.push(startDate);
      }

      if (endDate) {
        query += ' AND created_at <= ?';
        params.push(endDate);
      }

      query += ` GROUP BY period ORDER BY period DESC`;

      const [rows] = await connection.execute(query, params);
      return rows;
    });

    return {
      revenue: result,
      metadata: {
        totalRecords: result.length,
        dateRange: { startDate, endDate },
        groupBy
      }
    };
  }

  async generateAccountSummaryReport(parameters, filters) {
    // Implementation for generating account summary report
    const { startDate, endDate } = parameters;

    const result = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const query = `
        SELECT
          account_type,
          currency,
          COUNT(*) as account_count,
          AVG(balance) as average_balance,
          SUM(balance) as total_balance,
          MIN(balance) as min_balance,
          MAX(balance) as max_balance
        FROM accounts
        WHERE status = 'active'
        GROUP BY account_type, currency
        ORDER BY total_balance DESC
      `;

      const [rows] = await connection.execute(query);
      return rows;
    });

    return {
      accounts: result,
      metadata: {
        totalRecords: result.length,
        generatedAt: new Date().toISOString()
      }
    };
  }

  async updateAnalyticsDataByType(dataType, data, source) {
    // Implementation for updating analytics data based on type
    const changes = [];

    switch (dataType) {
      case 'transactions':
        changes.push(...await this.updateTransactionAnalytics(data));
        break;
      case 'accounts':
        changes.push(...await this.updateAccountAnalytics(data));
        break;
      case 'payments':
        changes.push(...await this.updatePaymentAnalytics(data));
        break;
      case 'users':
        changes.push(...await this.updateUserAnalytics(data));
        break;
      default:
        throw new Error(`Unsupported data type: ${dataType}`);
    }

    return changes;
  }

  async refreshAllCaches() {
    let totalAffected = 0;

    // Clear all caches
    this.cache.clear();

    // Refresh specific cache types
    totalAffected += await this.refreshCacheByType('transaction_summary');
    totalAffected += await this.refreshCacheByType('user_activity');
    totalAffected += await this.refreshCacheByType('payment_methods');
    totalAffected += await this.refreshCacheByType('revenue');
    totalAffected += await this.refreshCacheByType('account_summary');

    return totalAffected;
  }

  async refreshCacheByType(cacheType) {
    // Implementation for refreshing specific cache types
    // This would typically involve recalculating and caching expensive analytics queries
    let affectedRecords = 0;

    switch (cacheType) {
      case 'transaction_summary':
        // Refresh transaction summary cache
        affectedRecords = 100; // placeholder
        break;
      case 'user_activity':
        // Refresh user activity cache
        affectedRecords = 50; // placeholder
        break;
      // Add other cache types...
    }

    return affectedRecords;
  }

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

  countDataPoints(data) {
    if (Array.isArray(data)) {
      return data.length;
    }
    if (typeof data === 'object' && data !== null) {
      return Object.keys(data).length;
    }
    return 1;
  }

  convertToCSV(data) {
    // Simple CSV conversion - in production, use a proper CSV library
    if (!Array.isArray(data) || data.length === 0) {
      return '';
    }

    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(','),
      ...data.map(row => headers.map(header => JSON.stringify(row[header] || '')).join(','))
    ];

    return csvRows.join('\n');
  }

  estimatePDFSize(data) {
    // Rough estimation for PDF size
    return this.countDataPoints(data) * 1024; // 1KB per data point
  }

  invalidateRelatedCaches(dataType) {
    // Invalidate caches related to the data type
    const cacheKeys = this.cache.keys();
    for (const key of cacheKeys) {
      if (key.includes(dataType)) {
        this.cache.delete(key);
      }
    }
  }

  getAffectedMetrics(dataType) {
    // Return metrics affected by this data type
    const metricMap = {
      transactions: ['transaction_volume', 'transaction_count', 'average_transaction'],
      accounts: ['total_accounts', 'active_accounts', 'account_balance'],
      payments: ['payment_volume', 'payment_methods', 'revenue'],
      users: ['active_users', 'user_growth', 'user_activity']
    };

    return metricMap[dataType] || [];
  }

  async validateWidgetConfiguration(widget) {
    // Validate widget configuration
    if (!widget.type || !widget.title) {
      throw new Error('Widget must have type and title');
    }

    const validTypes = ['chart', 'metric', 'table', 'heatmap'];
    if (!validTypes.includes(widget.type)) {
      throw new Error(`Invalid widget type: ${widget.type}`);
    }
  }

  async getDashboardById(dashboardId) {
    const cached = this.cache.get(`dashboard:${dashboardId}`);
    if (cached) {
      return cached;
    }

    const result = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute('SELECT * FROM analytics_dashboards WHERE id = ?', [dashboardId]);
      return rows[0];
    });

    if (result) {
      // Parse JSON fields
      result.widgets = JSON.parse(result.widgets || '[]');
      result.filters = JSON.parse(result.filters || '{}');
      result.metadata = JSON.parse(result.metadata || '{}');

      this.cache.set(`dashboard:${dashboardId}`, result);
    }

    return result;
  }

  // Placeholder implementations for analytics updates
  async updateTransactionAnalytics(data) { return []; }
  async updateAccountAnalytics(data) { return []; }
  async updatePaymentAnalytics(data) { return []; }
  async updateUserAnalytics(data) { return []; }

  async getReportDataForExport(reportType, filters) {
    // Get report data for export - reuse existing report generation logic
    switch (reportType) {
      case 'transaction_summary':
        return await this.generateTransactionSummaryReport({}, filters);
      case 'user_activity':
        return await this.generateUserActivityReport({}, filters);
      case 'payment_methods':
        return await this.generatePaymentMethodsReport({}, filters);
      case 'revenue':
        return await this.generateRevenueReport({}, filters);
      case 'account_summary':
        return await this.generateAccountSummaryReport({}, filters);
      default:
        throw new Error(`Unsupported report type: ${reportType}`);
    }
  }
}