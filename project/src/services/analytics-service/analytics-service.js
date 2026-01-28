import { v4 as uuidv4 } from 'uuid';
import { AnalyticsCommandHandler } from './handlers/analytics-command-handler.js';
import { AnalyticsQueryHandler } from './handlers/analytics-query-handler.js';
import {
  GenerateAnalyticsReportCommand,
  UpdateAnalyticsDataCommand,
  RefreshAnalyticsCacheCommand,
  ExportAnalyticsDataCommand,
  CreateAnalyticsDashboardCommand,
  UpdateAnalyticsDashboardCommand
} from './commands/analytics-commands.js';
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
} from './queries/analytics-queries.js';
import { KafkaService } from '../../shared/messaging/kafka-service.js';
import EventStore from '../../shared/event-sourcing/event-store.js';
import CommandBus from '../../shared/cqrs/command-bus.js';
import QueryBus from '../../shared/cqrs/query-bus.js';

export class AnalyticsService {
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

    this.commandHandler = new AnalyticsCommandHandler({
      connectionPool: this.connectionPool,
      dualWriter: this.dualWriter,
      eventStore: this.eventStore,
      kafkaService: this.kafkaService,
      cache: this.cache,
      logger: this.logger
    });

    this.queryHandler = new AnalyticsQueryHandler({
      connectionPool: this.connectionPool,
      cache: this.cache,
      logger: this.logger
    });
  }

  async initialize() {
    // Register command handlers
    this.commandBus.registerHandler('GenerateAnalyticsReportCommand', this.commandHandler);
    this.commandBus.registerHandler('UpdateAnalyticsDataCommand', this.commandHandler);
    this.commandBus.registerHandler('RefreshAnalyticsCacheCommand', this.commandHandler);
    this.commandBus.registerHandler('ExportAnalyticsDataCommand', this.commandHandler);
    this.commandBus.registerHandler('CreateAnalyticsDashboardCommand', this.commandHandler);
    this.commandBus.registerHandler('UpdateAnalyticsDashboardCommand', this.commandHandler);

    // Register query handlers
    this.queryBus.registerHandler('GetTransactionAnalyticsQuery', this.queryHandler);
    this.queryBus.registerHandler('GetUserActivityAnalyticsQuery', this.queryHandler);
    this.queryBus.registerHandler('GetPaymentMethodsAnalyticsQuery', this.queryHandler);
    this.queryBus.registerHandler('GetRevenueAnalyticsQuery', this.queryHandler);
    this.queryBus.registerHandler('GetAccountAnalyticsQuery', this.queryHandler);
    this.queryBus.registerHandler('GetAnalyticsDashboardQuery', this.queryHandler);
    this.queryBus.registerHandler('GetAnalyticsDashboardsQuery', this.queryHandler);
    this.queryBus.registerHandler('GetAnalyticsReportQuery', this.queryHandler);
    this.queryBus.registerHandler('GetAnalyticsMetricsQuery', this.queryHandler);

    // Setup event handlers
    await this.setupEventHandlers();

    // Start cache cleanup
    this.startCacheCleanup();

    // Start real-time analytics processor
    this.startRealTimeAnalyticsProcessor();

    this.logger.info('AnalyticsService initialized successfully');
  }

  async setupEventHandlers() {
    // Subscribe to events from other services for real-time analytics updates
    await this.kafkaService.subscribe('transaction-events', async (event) => {
      try {
        const eventData = JSON.parse(event.value.toString());
        await this.handleTransactionEvent(eventData);
      } catch (error) {
        this.logger.error('Error processing transaction event:', error);
      }
    });

    await this.kafkaService.subscribe('account-events', async (event) => {
      try {
        const eventData = JSON.parse(event.value.toString());
        await this.handleAccountEvent(eventData);
      } catch (error) {
        this.logger.error('Error processing account event:', error);
      }
    });

    await this.kafkaService.subscribe('payment-events', async (event) => {
      try {
        const eventData = JSON.parse(event.value.toString());
        await this.handlePaymentEvent(eventData);
      } catch (error) {
        this.logger.error('Error processing payment event:', error);
      }
    });

    await this.kafkaService.subscribe('user-events', async (event) => {
      try {
        const eventData = JSON.parse(event.value.toString());
        await this.handleUserEvent(eventData);
      } catch (error) {
        this.logger.error('Error processing user event:', error);
      }
    });

    this.logger.info('Event handlers setup completed');
  }

  startCacheCleanup() {
    // Clean up cache every 10 minutes
    setInterval(() => {
      this.cache.clear();
      this.logger.debug('Analytics cache cleared');
    }, 10 * 60 * 1000);
  }

  startRealTimeAnalyticsProcessor() {
    // Process real-time analytics updates every minute
    setInterval(async () => {
      try {
        await this.processRealTimeAnalytics();
      } catch (error) {
        this.logger.error('Error processing real-time analytics:', error);
      }
    }, 60 * 1000);
  }

  // Command methods
  async generateAnalyticsReport(data) {
    const command = new GenerateAnalyticsReportCommand({
      reportId: data.reportId || uuidv4(),
      reportType: data.reportType,
      parameters: data.parameters || {},
      filters: data.filters || {},
      generatedBy: data.generatedBy
    });
    return await this.commandBus.execute(command);
  }

  async updateAnalyticsData(data) {
    const command = new UpdateAnalyticsDataCommand({
      dataType: data.dataType,
      data: data.data,
      source: data.source || 'manual',
      updatedBy: data.updatedBy,
      metadata: data.metadata
    });
    return await this.commandBus.execute(command);
  }

  async refreshAnalyticsCache(data) {
    const command = new RefreshAnalyticsCacheCommand({
      cacheType: data.cacheType || 'all',
      forceRefresh: data.forceRefresh || false,
      refreshedBy: data.refreshedBy,
      metadata: data.metadata
    });
    return await this.commandBus.execute(command);
  }

  async exportAnalyticsData(data) {
    const command = new ExportAnalyticsDataCommand({
      exportId: data.exportId || uuidv4(),
      reportType: data.reportType,
      format: data.format || 'json',
      filters: data.filters || {},
      includeCharts: data.includeCharts || false,
      exportedBy: data.exportedBy,
      metadata: data.metadata
    });
    return await this.commandBus.execute(command);
  }

  async createAnalyticsDashboard(data) {
    const command = new CreateAnalyticsDashboardCommand({
      dashboardId: data.dashboardId || uuidv4(),
      name: data.name,
      description: data.description,
      widgets: data.widgets || [],
      filters: data.filters || {},
      refreshInterval: data.refreshInterval || 300,
      createdBy: data.createdBy,
      metadata: data.metadata
    });
    return await this.commandBus.execute(command);
  }

  async updateAnalyticsDashboard(dashboardId, data) {
    const command = new UpdateAnalyticsDashboardCommand({
      dashboardId,
      updates: data.updates,
      updatedBy: data.updatedBy,
      metadata: data.metadata
    });
    return await this.commandBus.execute(command);
  }

  // Query methods
  async getTransactionAnalytics(data = {}) {
    const query = new GetTransactionAnalyticsQuery({
      startDate: data.startDate,
      endDate: data.endDate,
      groupBy: data.groupBy || 'day',
      filters: data.filters || {},
      metrics: data.metrics || ['count', 'volume', 'average'],
      page: data.page || 1,
      limit: data.limit || 100,
      includeRealtime: data.includeRealtime || false
    });
    return await this.queryBus.execute(query);
  }

  async getUserActivityAnalytics(data = {}) {
    const query = new GetUserActivityAnalyticsQuery({
      startDate: data.startDate,
      endDate: data.endDate,
      metric: data.metric || 'transactions',
      groupBy: data.groupBy || 'day',
      filters: data.filters || {},
      segmentBy: data.segmentBy || 'all',
      page: data.page || 1,
      limit: data.limit || 100,
      includeTrends: data.includeTrends || false
    });
    return await this.queryBus.execute(query);
  }

  async getPaymentMethodsAnalytics(data = {}) {
    const query = new GetPaymentMethodsAnalyticsQuery({
      startDate: data.startDate,
      endDate: data.endDate,
      groupBy: data.groupBy || 'method',
      filters: data.filters || {},
      includeTrends: data.includeTrends || false,
      includeComparison: data.includeComparison || false,
      page: data.page || 1,
      limit: data.limit || 50
    });
    return await this.queryBus.execute(query);
  }

  async getRevenueAnalytics(data = {}) {
    const query = new GetRevenueAnalyticsQuery({
      startDate: data.startDate,
      endDate: data.endDate,
      groupBy: data.groupBy || 'month',
      filters: data.filters || {},
      includeFees: data.includeFees !== false,
      includeRefunds: data.includeRefunds || false,
      currency: data.currency,
      page: data.page || 1,
      limit: data.limit || 100
    });
    return await this.queryBus.execute(query);
  }

  async getAccountAnalytics(data = {}) {
    const query = new GetAccountAnalyticsQuery({
      startDate: data.startDate,
      endDate: data.endDate,
      metrics: data.metrics || ['total_accounts', 'active_accounts', 'balance_distribution'],
      groupBy: data.groupBy || 'month',
      filters: data.filters || {},
      includeGeographic: data.includeGeographic || false,
      page: data.page || 1,
      limit: data.limit || 100
    });
    return await this.queryBus.execute(query);
  }

  async getAnalyticsDashboard(dashboardId, options = {}) {
    const query = new GetAnalyticsDashboardQuery({
      dashboardId,
      includeData: options.includeData !== false,
      refreshData: options.refreshData || false,
      filters: options.filters || {}
    });
    return await this.queryBus.execute(query);
  }

  async getAnalyticsDashboards(options = {}) {
    const query = new GetAnalyticsDashboardsQuery({
      filters: options.filters || {},
      page: options.page || 1,
      limit: options.limit || 20,
      sortBy: options.sortBy || 'created_at',
      sortOrder: options.sortOrder || 'desc'
    });
    return await this.queryBus.execute(query);
  }

  async getAnalyticsReport(reportId, options = {}) {
    const query = new GetAnalyticsReportQuery({
      reportId,
      includeData: options.includeData !== false,
      format: options.format || 'json'
    });
    return await this.queryBus.execute(query);
  }

  async getAnalyticsMetrics(options = {}) {
    const query = new GetAnalyticsMetricsQuery({
      metricType: options.metricType || 'kpi',
      timeRange: options.timeRange || '30d',
      filters: options.filters || {},
      realTime: options.realTime || false
    });
    return await this.queryBus.execute(query);
  }

  // Event handling methods
  async handleTransactionEvent(event) {
    await this.updateAnalyticsData({
      dataType: 'transactions',
      data: event,
      source: 'event',
      updatedBy: 'system'
    });
  }

  async handleAccountEvent(event) {
    await this.updateAnalyticsData({
      dataType: 'accounts',
      data: event,
      source: 'event',
      updatedBy: 'system'
    });
  }

  async handlePaymentEvent(event) {
    await this.updateAnalyticsData({
      dataType: 'payments',
      data: event,
      source: 'event',
      updatedBy: 'system'
    });
  }

  async handleUserEvent(event) {
    await this.updateAnalyticsData({
      dataType: 'users',
      data: event,
      source: 'event',
      updatedBy: 'system'
    });
  }

  async processRealTimeAnalytics() {
    // Calculate and cache real-time metrics
    try {
      const metrics = await this.getAnalyticsMetrics({ realTime: true });

      // Publish real-time metrics to Kafka
      await this.kafkaService.produce('analytics-realtime', {
        type: 'realtime_metrics',
        metrics,
        timestamp: new Date().toISOString()
      });

      this.logger.debug('Real-time analytics processed successfully');
    } catch (error) {
      this.logger.error('Error processing real-time analytics:', error);
    }
  }

  // Utility methods
  async getAnalyticsSummary(userId) {
    const [
      transactionAnalytics,
      userActivity,
      revenueAnalytics,
      accountAnalytics
    ] = await Promise.all([
      this.getTransactionAnalytics({ limit: 1 }),
      this.getUserActivityAnalytics({ limit: 1 }),
      this.getRevenueAnalytics({ limit: 1 }),
      this.getAccountAnalytics({ limit: 1 })
    ]);

    return {
      userId,
      summary: {
        totalTransactions: transactionAnalytics.analytics[0]?.transaction_count || 0,
        totalVolume: transactionAnalytics.analytics[0]?.total_volume || 0,
        activeUsers: userActivity.activity[0]?.active_users || 0,
        totalRevenue: revenueAnalytics.revenue[0]?.total_revenue || 0,
        totalAccounts: accountAnalytics.accounts.reduce((sum, acc) => sum + acc.account_count, 0)
      },
      generatedAt: new Date().toISOString()
    };
  }

  async generateAnalyticsReportByType(reportType, parameters = {}, filters = {}, generatedBy) {
    return await this.generateAnalyticsReport({
      reportType,
      parameters,
      filters,
      generatedBy
    });
  }

  async getAnalyticsHealthStatus() {
    const health = {
      service: 'analytics-service',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      components: {
        database: this.connectionPool.getStats(),
        cache: {
          size: this.cache.size,
          types: Array.from(this.cache.keys()).reduce((acc, key) => {
            const type = key.split(':')[0];
            acc[type] = (acc[type] || 0) + 1;
            return acc;
          }, {})
        },
        kafka: await this.kafkaService.getHealthStatus(),
        eventStore: this.eventStore.getStats()
      }
    };

    // Check if critical components are working
    if (!this.connectionPool.isConnected()) {
      health.status = 'degraded';
      health.components.database.status = 'disconnected';
    }

    return health;
  }

  async cleanupOldAnalyticsData(retentionDays = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    // Clean up old analytics data from databases
    await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      // Clean up old reports
      await connection.execute(
        'DELETE FROM analytics_reports WHERE created_at < ?',
        [cutoffDate]
      );

      // Clean up old exports
      await connection.execute(
        'DELETE FROM analytics_exports WHERE created_at < ?',
        [cutoffDate]
      );

      // Clean up old dashboard data (keep dashboards but clean old cached data)
      this.logger.info(`Cleaned up analytics data older than ${retentionDays} days`);
    });

    // Clean up cache
    const cacheKeys = Array.from(this.cache.keys());
    for (const key of cacheKeys) {
      if (key.includes('report:') || key.includes('export:')) {
        this.cache.delete(key);
      }
    }
  }
}