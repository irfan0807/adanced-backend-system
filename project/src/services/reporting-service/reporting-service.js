import { v4 as uuidv4 } from 'uuid';
import { ReportingCommandHandler } from './handlers/reporting-command-handler.js';
import { ReportingQueryHandler } from './handlers/reporting-query-handler.js';
import {
  GenerateReportCommand,
  ScheduleReportCommand,
  UpdateScheduledReportCommand,
  DeleteScheduledReportCommand,
  CreateReportTemplateCommand,
  UpdateReportTemplateCommand,
  ExecuteScheduledReportCommand,
  CacheReportDataCommand,
  ExportReportDataCommand,
  GenerateDashboardCommand,
  UpdateDashboardCommand
} from './commands/reporting-commands.js';
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
} from './queries/reporting-queries.js';
import { KafkaService } from '../../shared/messaging/kafka-service.js';
import EventStore from '../../shared/event-sourcing/event-store.js';
import CommandBus from '../../shared/cqrs/command-bus.js';
import QueryBus from '../../shared/cqrs/query-bus.js';

export class ReportingService {
  constructor(dependencies) {
    this.connectionPool = dependencies.connectionPool;
    this.dualWriter = dependencies.dualWriter;
    this.eventStore = dependencies.eventStore || new EventStore(dependencies.connectionPool, dependencies.kafkaService);
    this.commandBus = dependencies.commandBus || new CommandBus();
    this.queryBus = dependencies.queryBus || new QueryBus();
    this.kafkaService = dependencies.kafkaService || new KafkaService();
    this.logger = dependencies.logger;

    // Initialize cache
    this.cache = new Map();

    // Initialize scheduler (placeholder - would use node-cron or similar)
    this.scheduler = dependencies.scheduler || {
      scheduleJob: (id, cron, callback) => this.logger.info(`Scheduled job ${id} with cron ${cron}`),
      rescheduleJob: (id, cron) => this.logger.info(`Rescheduled job ${id}`),
      cancelJob: (id) => this.logger.info(`Cancelled job ${id}`)
    };

    this.commandHandler = new ReportingCommandHandler({
      connectionPool: this.connectionPool,
      dualWriter: this.dualWriter,
      eventStore: this.eventStore,
      kafkaService: this.kafkaService,
      cache: this.cache,
      scheduler: this.scheduler,
      logger: this.logger
    });

    this.queryHandler = new ReportingQueryHandler({
      connectionPool: this.connectionPool,
      cache: this.cache,
      logger: this.logger
    });
  }

  async initialize() {
    // Register command handlers
    this.commandBus.registerHandler('GenerateReportCommand', this.commandHandler);
    this.commandBus.registerHandler('ScheduleReportCommand', this.commandHandler);
    this.commandBus.registerHandler('UpdateScheduledReportCommand', this.commandHandler);
    this.commandBus.registerHandler('DeleteScheduledReportCommand', this.commandHandler);
    this.commandBus.registerHandler('CreateReportTemplateCommand', this.commandHandler);
    this.commandBus.registerHandler('UpdateReportTemplateCommand', this.commandHandler);
    this.commandBus.registerHandler('ExecuteScheduledReportCommand', this.commandHandler);
    this.commandBus.registerHandler('CacheReportDataCommand', this.commandHandler);
    this.commandBus.registerHandler('ExportReportDataCommand', this.commandHandler);
    this.commandBus.registerHandler('GenerateDashboardCommand', this.commandHandler);
    this.commandBus.registerHandler('UpdateDashboardCommand', this.commandHandler);

    // Register query handlers
    this.queryBus.registerHandler('GetReportQuery', this.queryHandler);
    this.queryBus.registerHandler('GetReportsQuery', this.queryHandler);
    this.queryBus.registerHandler('GetScheduledReportsQuery', this.queryHandler);
    this.queryBus.registerHandler('GetReportTemplatesQuery', this.queryHandler);
    this.queryBus.registerHandler('GetReportAnalyticsQuery', this.queryHandler);
    this.queryBus.registerHandler('GetDashboardQuery', this.queryHandler);
    this.queryBus.registerHandler('GetDashboardsQuery', this.queryHandler);
    this.queryBus.registerHandler('GetCachedReportDataQuery', this.queryHandler);
    this.queryBus.registerHandler('GetDataSourcesQuery', this.queryHandler);
    this.queryBus.registerHandler('GetReportExecutionHistoryQuery', this.queryHandler);
    this.queryBus.registerHandler('GetReportMetricsQuery', this.queryHandler);
    this.queryBus.registerHandler('GetRealTimeDataQuery', this.queryHandler);
    this.queryBus.registerHandler('GetReportTemplateUsageQuery', this.queryHandler);

    // Setup event handlers
    await this.setupEventHandlers();

    // Start cache cleanup
    this.startCacheCleanup();

    // Start scheduled report processor
    this.startScheduledReportProcessor();

    this.logger.info('Reporting Service initialized');
  }

  // Report Generation Methods
  async generateReport(reportType, parameters, format = 'json', userId) {
    const command = new GenerateReportCommand({
      reportType,
      parameters,
      format,
      userId,
      requestedAt: new Date().toISOString()
    });

    return await this.commandBus.execute(command);
  }

  async getReport(reportId, includeData = true) {
    const query = new GetReportQuery({ reportId, includeData });
    return await this.queryBus.execute(query);
  }

  async getReports(criteria = {}) {
    const query = new GetReportsQuery(criteria);
    return await this.queryBus.execute(query);
  }

  // Scheduled Reports Methods
  async scheduleReport(scheduleData) {
    const command = new ScheduleReportCommand(scheduleData);
    return await this.commandBus.execute(command);
  }

  async updateScheduledReport(id, updates) {
    const command = new UpdateScheduledReportCommand({
      id,
      updates,
      updatedBy: updates.updatedBy,
      updatedAt: new Date().toISOString()
    });

    return await this.commandBus.execute(command);
  }

  async deleteScheduledReport(id, deletedBy) {
    const command = new DeleteScheduledReportCommand({
      id,
      deletedBy,
      deletedAt: new Date().toISOString()
    });

    return await this.commandBus.execute(command);
  }

  async getScheduledReports(criteria = {}) {
    const query = new GetScheduledReportsQuery(criteria);
    return await this.queryBus.execute(query);
  }

  // Report Templates Methods
  async createReportTemplate(templateData) {
    const command = new CreateReportTemplateCommand(templateData);
    return await this.commandBus.execute(command);
  }

  async updateReportTemplate(id, updates) {
    const command = new UpdateReportTemplateCommand({
      id,
      updates,
      updatedBy: updates.updatedBy,
      updatedAt: new Date().toISOString()
    });

    return await this.commandBus.execute(command);
  }

  async getReportTemplates(criteria = {}) {
    const query = new GetReportTemplatesQuery(criteria);
    return await this.queryBus.execute(query);
  }

  // Dashboard Methods
  async createDashboard(dashboardData) {
    const command = new GenerateDashboardCommand(dashboardData);
    return await this.commandBus.execute(command);
  }

  async updateDashboard(id, updates) {
    const command = new UpdateDashboardCommand({
      id,
      updates,
      updatedBy: updates.updatedBy,
      updatedAt: new Date().toISOString()
    });

    return await this.commandBus.execute(command);
  }

  async getDashboard(dashboardId, refreshData = false) {
    const query = new GetDashboardQuery({ dashboardId, refreshData });
    return await this.queryBus.execute(query);
  }

  async getDashboards(criteria = {}) {
    const query = new GetDashboardsQuery(criteria);
    return await this.queryBus.execute(query);
  }

  // Analytics and Metrics Methods
  async getReportAnalytics(criteria = {}) {
    const query = new GetReportAnalyticsQuery(criteria);
    return await this.queryBus.execute(query);
  }

  async getReportMetrics(criteria = {}) {
    const query = new GetReportMetricsQuery(criteria);
    return await this.queryBus.execute(query);
  }

  // Export Methods
  async exportReportData(reportId, format, filters = {}, userId) {
    const command = new ExportReportDataCommand({
      reportId,
      format,
      filters,
      userId,
      requestedAt: new Date().toISOString()
    });

    return await this.commandBus.execute(command);
  }

  // Real-time Data Methods
  async getRealTimeData(dataSource, query, options = {}) {
    const realTimeQuery = new GetRealTimeDataQuery({
      dataSource,
      query,
      filters: options.filters || {},
      limit: options.limit || 1000,
      sortBy: options.sortBy,
      sortOrder: options.sortOrder,
      includeMetadata: options.includeMetadata
    });

    return await this.queryBus.execute(realTimeQuery);
  }

  // Data Sources Methods
  async getDataSources(criteria = {}) {
    const query = new GetDataSourcesQuery(criteria);
    return await this.queryBus.execute(query);
  }

  // Report Execution History
  async getReportExecutionHistory(criteria = {}) {
    const query = new GetReportExecutionHistoryQuery(criteria);
    return await this.queryBus.execute(query);
  }

  // Template Usage Analytics
  async getReportTemplateUsage(templateId, dateRange, options = {}) {
    const query = new GetReportTemplateUsageQuery({
      templateId,
      dateRange,
      groupBy: options.groupBy || 'day',
      includeUsers: options.includeUsers || false,
      limit: options.limit || 50
    });

    return await this.queryBus.execute(query);
  }

  // Cache Methods
  async getCachedReportData(cacheKey, allowStale = true) {
    const query = new GetCachedReportDataQuery({
      cacheKey,
      allowStale
    });

    return await this.queryBus.execute(query);
  }

  async cacheReportData(reportType, parameters, data, expiresAt) {
    const command = new CacheReportDataCommand({
      reportType,
      parameters,
      data,
      expiresAt,
      createdAt: new Date().toISOString()
    });

    return await this.commandBus.execute(command);
  }

  // Event Handling
  async setupEventHandlers() {
    // Listen for events from other services
    const eventTopics = [
      'transaction-events',
      'user-events',
      'payment-events',
      'audit-events'
    ];

    for (const topic of eventTopics) {
      await this.kafkaService.consumeMessages(
        [topic],
        `reporting-service-${topic.replace('-events', '')}`,
        async (message) => {
          try {
            const event = JSON.parse(message.value);
            await this.handleExternalEvent(event);
          } catch (error) {
            this.logger.error('Error handling external event:', error);
          }
        }
      );
    }
  }

  async handleExternalEvent(event) {
    // Handle events that might trigger report updates or analytics
    switch (event.eventType) {
      case 'TransactionCompleted':
        await this.handleTransactionCompleted(event);
        break;
      case 'UserRegistered':
        await this.handleUserRegistered(event);
        break;
      case 'PaymentProcessed':
        await this.handlePaymentProcessed(event);
        break;
      case 'AuditLogCreated':
        await this.handleAuditLogCreated(event);
        break;
      default:
        // Log analytics events for all events
        await this.logAnalyticsEvent(event);
    }
  }

  async handleTransactionCompleted(event) {
    // Invalidate transaction-related caches
    await this.invalidateCacheByPattern('transaction-*');

    // Update real-time metrics
    await this.updateRealTimeMetrics('transactions', event.eventData);
  }

  async handleUserRegistered(event) {
    // Update user analytics
    await this.updateUserAnalytics(event.eventData);
  }

  async handlePaymentProcessed(event) {
    // Update financial metrics
    await this.updateFinancialMetrics(event.eventData);
  }

  async handleAuditLogCreated(event) {
    // Update compliance metrics
    await this.updateComplianceMetrics(event.eventData);
  }

  async logAnalyticsEvent(event) {
    // Log all events for analytics purposes
    const analyticsEvent = {
      eventType: event.eventType,
      aggregateId: event.aggregateId,
      timestamp: event.timestamp,
      service: 'reporting-service',
      metadata: {
        sourceEvent: event,
        processedAt: new Date().toISOString()
      }
    };

    // Store in analytics collection
    await this.dualWriter.writeToAllDatabases(analyticsEvent, 'event_analytics');
  }

  // Cache Management
  startCacheCleanup() {
    // Clean up expired cache entries every 5 minutes
    setInterval(async () => {
      try {
        await this.cleanupExpiredCache();
      } catch (error) {
        this.logger.error('Error cleaning up cache:', error);
      }
    }, 5 * 60 * 1000);
  }

  async cleanupExpiredCache() {
    const now = new Date().toISOString();

    // Clean in-memory cache
    for (const [key, value] of this.cache.entries()) {
      if (value.expiresAt && new Date(value.expiresAt) < new Date()) {
        this.cache.delete(key);
      }
    }

    // Clean database cache
    await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      await connection.execute(
        'DELETE FROM report_cache WHERE expires_at < ?',
        [now]
      );
    });

    this.logger.debug('Cache cleanup completed');
  }

  async invalidateCacheByPattern(pattern) {
    // Simple pattern matching for cache invalidation
    const regex = new RegExp(pattern.replace('*', '.*'));

    // Invalidate in-memory cache
    for (const [key, value] of this.cache.entries()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }

    // Invalidate database cache
    await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      await connection.execute(
        'DELETE FROM report_cache WHERE cache_key REGEXP ?',
        [pattern.replace('*', '.*')]
      );
    });
  }

  // Scheduled Report Processing
  startScheduledReportProcessor() {
    // Process due scheduled reports every minute
    setInterval(async () => {
      try {
        await this.processDueScheduledReports();
      } catch (error) {
        this.logger.error('Error processing scheduled reports:', error);
      }
    }, 60 * 1000);
  }

  async processDueScheduledReports() {
    const now = new Date().toISOString();

    const dueReports = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT * FROM scheduled_reports WHERE is_active = true AND next_run <= ?',
        [now]
      );
      return rows;
    });

    for (const report of dueReports) {
      try {
        const executeCommand = new ExecuteScheduledReportCommand({
          scheduledReportId: report.id,
          executionId: uuidv4(),
          triggeredAt: now,
          triggeredBy: 'scheduler'
        });

        await this.commandBus.execute(executeCommand);

        // Update next run time
        const nextRun = this.calculateNextRunTime(report.schedule);
        await this.connectionPool.executeWithMySQLConnection(async (connection) => {
          await connection.execute(
            'UPDATE scheduled_reports SET next_run = ?, updated_at = NOW() WHERE id = ?',
            [nextRun, report.id]
          );
        });

      } catch (error) {
        this.logger.error(`Error executing scheduled report ${report.id}:`, error);
      }
    }
  }

  calculateNextRunTime(cronExpression) {
    // Simple implementation - in production, use a proper cron library
    // For now, assume daily schedules
    const nextRun = new Date();
    nextRun.setDate(nextRun.getDate() + 1);
    return nextRun.toISOString();
  }

  // Real-time Metrics Updates
  async updateRealTimeMetrics(metricType, data) {
    const metricKey = `realtime:${metricType}`;
    const currentMetrics = this.cache.get(metricKey) || {
      count: 0,
      lastUpdated: new Date().toISOString(),
      data: {}
    };

    currentMetrics.count += 1;
    currentMetrics.lastUpdated = new Date().toISOString();

    // Update specific metric data
    switch (metricType) {
      case 'transactions':
        currentMetrics.data.totalAmount = (currentMetrics.data.totalAmount || 0) + (data.amount || 0);
        currentMetrics.data.transactionCount = (currentMetrics.data.transactionCount || 0) + 1;
        break;
      // Add other metric types as needed
    }

    this.cache.set(metricKey, currentMetrics);
  }

  async updateUserAnalytics(userData) {
    // Update user registration analytics
    await this.updateRealTimeMetrics('user-registrations', userData);
  }

  async updateFinancialMetrics(paymentData) {
    // Update financial metrics
    await this.updateRealTimeMetrics('payments', paymentData);
  }

  async updateComplianceMetrics(auditData) {
    // Update compliance metrics
    await this.updateRealTimeMetrics('audit-events', auditData);
  }

  // Report Generation Helpers
  async generateTransactionReport(parameters) {
    // Enhanced transaction report with more detailed analytics
    const { startDate, endDate, groupBy = 'day' } = parameters;

    const transactions = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(`
        SELECT
          DATE(created_at) as date,
          status,
          payment_method,
          currency,
          COUNT(*) as count,
          SUM(amount) as total_amount,
          AVG(amount) as avg_amount,
          MIN(amount) as min_amount,
          MAX(amount) as max_amount
        FROM transactions
        WHERE created_at BETWEEN ? AND ?
        GROUP BY DATE(created_at), status, payment_method, currency
        ORDER BY date DESC
      `, [startDate, endDate]);
      return rows;
    });

    // Group by the specified grouping
    const groupedData = this.groupTransactionsByPeriod(transactions, groupBy);

    return {
      reportType: 'transaction-summary',
      period: { startDate, endDate },
      generatedAt: new Date().toISOString(),
      summary: this.calculateTransactionSummary(transactions),
      groupedData,
      rawData: transactions
    };
  }

  groupTransactionsByPeriod(transactions, groupBy) {
    const groups = {};

    transactions.forEach(transaction => {
      let key;
      const date = new Date(transaction.date);

      switch (groupBy) {
        case 'week':
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = weekStart.toISOString().split('T')[0];
          break;
        case 'month':
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          break;
        default:
          key = transaction.date;
      }

      if (!groups[key]) {
        groups[key] = {
          period: key,
          totalTransactions: 0,
          totalAmount: 0,
          byStatus: {},
          byPaymentMethod: {},
          byCurrency: {}
        };
      }

      groups[key].totalTransactions += transaction.count;
      groups[key].totalAmount += parseFloat(transaction.total_amount);

      // Group by status
      if (!groups[key].byStatus[transaction.status]) {
        groups[key].byStatus[transaction.status] = { count: 0, amount: 0 };
      }
      groups[key].byStatus[transaction.status].count += transaction.count;
      groups[key].byStatus[transaction.status].amount += parseFloat(transaction.total_amount);

      // Group by payment method
      if (!groups[key].byPaymentMethod[transaction.payment_method]) {
        groups[key].byPaymentMethod[transaction.payment_method] = { count: 0, amount: 0 };
      }
      groups[key].byPaymentMethod[transaction.payment_method].count += transaction.count;
      groups[key].byPaymentMethod[transaction.payment_method].amount += parseFloat(transaction.total_amount);

      // Group by currency
      if (!groups[key].byCurrency[transaction.currency]) {
        groups[key].byCurrency[transaction.currency] = { count: 0, amount: 0 };
      }
      groups[key].byCurrency[transaction.currency].count += transaction.count;
      groups[key].byCurrency[transaction.currency].amount += parseFloat(transaction.total_amount);
    });

    return Object.values(groups);
  }

  calculateTransactionSummary(transactions) {
    const summary = {
      totalTransactions: 0,
      totalAmount: 0,
      uniqueCurrencies: new Set(),
      uniquePaymentMethods: new Set(),
      statusBreakdown: {},
      paymentMethodBreakdown: {},
      currencyBreakdown: {}
    };

    transactions.forEach(transaction => {
      summary.totalTransactions += transaction.count;
      summary.totalAmount += parseFloat(transaction.total_amount);
      summary.uniqueCurrencies.add(transaction.currency);
      summary.uniquePaymentMethods.add(transaction.payment_method);

      // Status breakdown
      if (!summary.statusBreakdown[transaction.status]) {
        summary.statusBreakdown[transaction.status] = { count: 0, amount: 0 };
      }
      summary.statusBreakdown[transaction.status].count += transaction.count;
      summary.statusBreakdown[transaction.status].amount += parseFloat(transaction.total_amount);

      // Payment method breakdown
      if (!summary.paymentMethodBreakdown[transaction.payment_method]) {
        summary.paymentMethodBreakdown[transaction.payment_method] = { count: 0, amount: 0 };
      }
      summary.paymentMethodBreakdown[transaction.payment_method].count += transaction.count;
      summary.paymentMethodBreakdown[transaction.payment_method].amount += parseFloat(transaction.total_amount);

      // Currency breakdown
      if (!summary.currencyBreakdown[transaction.currency]) {
        summary.currencyBreakdown[transaction.currency] = { count: 0, amount: 0 };
      }
      summary.currencyBreakdown[transaction.currency].count += transaction.count;
      summary.currencyBreakdown[transaction.currency].amount += parseFloat(transaction.total_amount);
    });

    summary.uniqueCurrencies = summary.uniqueCurrencies.size;
    summary.uniquePaymentMethods = summary.uniquePaymentMethods.size;

    return summary;
  }

  // Utility Methods
  convertToCSV(data, headers) {
    if (!data || data.length === 0) return '';

    const csvHeaders = headers || Object.keys(data[0]);
    const csvRows = data.map(row =>
      csvHeaders.map(header => {
        const value = row[header];
        // Escape commas and quotes in CSV
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',')
    );

    return [csvHeaders.join(','), ...csvRows].join('\n');
  }

  generatePDFFinancialReport(report) {
    // Placeholder for PDF generation
    // In production, would use a library like pdfkit or puppeteer
    return Buffer.from(JSON.stringify(report, null, 2));
  }

  // Analytics tracking
  async trackReportUsage(reportId, action, userId, metadata = {}) {
    const analyticsEvent = {
      id: uuidv4(),
      reportId,
      action, // generated, viewed, downloaded, shared
      userId,
      timestamp: new Date().toISOString(),
      sessionId: metadata.sessionId,
      duration: metadata.duration,
      filters: JSON.stringify(metadata.filters || {}),
      performance: JSON.stringify(metadata.performance || {}),
      metadata: JSON.stringify(metadata)
    };

    await this.dualWriter.writeToAllDatabases(analyticsEvent, 'report_analytics');
  }

  // Health check data
  getHealthStatus() {
    return {
      cache: {
        size: this.cache.size,
        hitRate: this.calculateCacheHitRate()
      },
      scheduler: {
        activeJobs: this.getActiveScheduledJobsCount()
      },
      database: this.connectionPool.getStats(),
      kafka: this.kafkaService.getStats()
    };
  }

  calculateCacheHitRate() {
    // Placeholder - would track cache hits/misses
    return 0.85;
  }

  getActiveScheduledJobsCount() {
    // Placeholder - would track active scheduled jobs
    return 5;
  }
}