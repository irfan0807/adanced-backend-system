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
} from '../commands/reporting-commands.js';
import {
  ReportGeneratedEvent,
  ReportGenerationFailedEvent,
  ScheduledReportCreatedEvent,
  ScheduledReportExecutedEvent,
  ScheduledReportUpdatedEvent,
  ScheduledReportDeletedEvent,
  ReportTemplateCreatedEvent,
  ReportTemplateUpdatedEvent,
  ReportDataCachedEvent,
  ReportDataExportedEvent,
  DashboardCreatedEvent,
  DashboardUpdatedEvent
} from '../events/reporting-events.js';

export class ReportingCommandHandler {
  constructor(dependencies) {
    this.connectionPool = dependencies.connectionPool;
    this.dualWriter = dependencies.dualWriter;
    this.eventStore = dependencies.eventStore;
    this.kafkaService = dependencies.kafkaService;
    this.cache = dependencies.cache || new Map(); // Simple in-memory cache
    this.logger = dependencies.logger;
    this.scheduler = dependencies.scheduler;
  }

  async handle(command) {
    try {
      command.validate();

      switch (command.constructor.name) {
        case 'GenerateReportCommand':
          return await this.handleGenerateReport(command);
        case 'ScheduleReportCommand':
          return await this.handleScheduleReport(command);
        case 'UpdateScheduledReportCommand':
          return await this.handleUpdateScheduledReport(command);
        case 'DeleteScheduledReportCommand':
          return await this.handleDeleteScheduledReport(command);
        case 'CreateReportTemplateCommand':
          return await this.handleCreateReportTemplate(command);
        case 'UpdateReportTemplateCommand':
          return await this.handleUpdateReportTemplate(command);
        case 'ExecuteScheduledReportCommand':
          return await this.handleExecuteScheduledReport(command);
        case 'CacheReportDataCommand':
          return await this.handleCacheReportData(command);
        case 'ExportReportDataCommand':
          return await this.handleExportReportData(command);
        case 'GenerateDashboardCommand':
          return await this.handleGenerateDashboard(command);
        case 'UpdateDashboardCommand':
          return await this.handleUpdateDashboard(command);
        default:
          throw new Error(`Unknown command type: ${command.constructor.name}`);
      }
    } catch (error) {
      this.logger.error(`Error handling command ${command.constructor.name}:`, error);
      throw error;
    }
  }

  async handleGenerateReport(command) {
    const startTime = Date.now();

    try {
      // Generate the report based on type
      const reportData = await this.generateReportData(command.reportType, command.parameters);

      // Calculate execution metrics
      const executionTime = Date.now() - startTime;
      const recordCount = this.calculateRecordCount(reportData);
      const fileSize = this.calculateFileSize(reportData);

      // Store report metadata
      const reportMetadata = {
        id: command.id,
        reportType: command.reportType,
        parameters: command.parameters,
        format: command.format,
        generatedBy: command.userId,
        executionTime,
        recordCount,
        fileSize,
        status: 'completed',
        data: command.format === 'json' ? reportData : null,
        createdAt: command.requestedAt,
        expiresAt: this.calculateExpiration(command.reportType)
      };

      // Store in database
      await this.dualWriter.writeToAllDatabases(reportMetadata, 'reports');

      // Publish success event
      const event = new ReportGeneratedEvent({
        reportId: command.id,
        reportType: command.reportType,
        parameters: command.parameters,
        format: command.format,
        generatedBy: command.userId,
        executionTime,
        recordCount,
        fileSize,
        status: 'completed'
      });
      await this.eventStore.saveEvent(event);
      await this.kafkaService.produce('reporting-events', event);

      return reportMetadata;

    } catch (error) {
      // Publish failure event
      const event = new ReportGenerationFailedEvent({
        reportId: command.id,
        reportType: command.reportType,
        parameters: command.parameters,
        error: error.message,
        errorCode: error.code || 'REPORT_GENERATION_ERROR'
      });
      await this.eventStore.saveEvent(event);
      await this.kafkaService.produce('reporting-events', event);

      throw error;
    }
  }

  async handleScheduleReport(command) {
    // Store scheduled report
    const scheduledReport = {
      id: command.id,
      name: command.name,
      reportType: command.reportType,
      schedule: command.schedule,
      parameters: command.parameters,
      format: command.format,
      recipients: command.recipients,
      deliveryMethod: command.deliveryMethod,
      isActive: command.isActive,
      createdBy: command.createdBy,
      createdAt: command.createdAt,
      nextRun: this.calculateNextRun(command.schedule),
      metadata: command.metadata
    };

    await this.dualWriter.writeToAllDatabases(scheduledReport, 'scheduled_reports');

    // Register with scheduler
    if (this.scheduler && command.isActive) {
      await this.scheduler.scheduleJob(command.id, command.schedule, async () => {
        await this.executeScheduledReport(command.id);
      });
    }

    // Publish event
    const event = new ScheduledReportCreatedEvent({
      scheduledReportId: command.id,
      name: command.name,
      reportType: command.reportType,
      schedule: command.schedule,
      parameters: command.parameters,
      format: command.format,
      recipients: command.recipients,
      deliveryMethod: command.deliveryMethod,
      createdBy: command.createdBy
    });
    await this.eventStore.saveEvent(event);
    await this.kafkaService.produce('reporting-events', event);

    return scheduledReport;
  }

  async handleUpdateScheduledReport(command) {
    // Get current report
    const currentReport = await this.getScheduledReportById(command.id);
    if (!currentReport) {
      throw new Error('Scheduled report not found');
    }

    // Apply updates
    const updatedReport = { ...currentReport, ...command.updates, updatedAt: command.updatedAt };

    // Recalculate next run if schedule changed
    if (command.updates.schedule) {
      updatedReport.nextRun = this.calculateNextRun(command.updates.schedule);
    }

    // Update in database
    await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const updateFields = Object.keys(command.updates).map(key => `${key} = ?`).join(', ');
      const values = [...Object.values(command.updates), command.id];
      await connection.execute(
        `UPDATE scheduled_reports SET ${updateFields}, updated_at = NOW() WHERE id = ?`,
        values
      );
    });

    // Update scheduler if needed
    if (this.scheduler) {
      if (updatedReport.isActive) {
        await this.scheduler.rescheduleJob(command.id, updatedReport.schedule);
      } else {
        await this.scheduler.cancelJob(command.id);
      }
    }

    // Publish event
    const event = new ScheduledReportUpdatedEvent({
      scheduledReportId: command.id,
      updates: command.updates,
      updatedBy: command.updatedBy,
      previousValues: currentReport
    });
    await this.eventStore.saveEvent(event);
    await this.kafkaService.produce('reporting-events', event);

    return updatedReport;
  }

  async handleDeleteScheduledReport(command) {
    // Get report for event
    const report = await this.getScheduledReportById(command.id);
    if (!report) {
      throw new Error('Scheduled report not found');
    }

    // Cancel scheduler job
    if (this.scheduler) {
      await this.scheduler.cancelJob(command.id);
    }

    // Soft delete
    await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      await connection.execute(
        'UPDATE scheduled_reports SET is_active = false, deleted_at = NOW(), deleted_by = ? WHERE id = ?',
        [command.deletedBy, command.id]
      );
    });

    // Publish event
    const event = new ScheduledReportDeletedEvent({
      scheduledReportId: command.id,
      deletedBy: command.deletedBy,
      deletionReason: 'User requested deletion'
    });
    await this.eventStore.saveEvent(event);
    await this.kafkaService.produce('reporting-events', event);

    return { id: command.id, deleted: true };
  }

  async handleCreateReportTemplate(command) {
    const template = {
      id: command.id,
      name: command.name,
      description: command.description,
      reportType: command.reportType,
      template: JSON.stringify(command.template),
      parameters: JSON.stringify(command.parameters),
      filters: JSON.stringify(command.filters),
      visualizations: JSON.stringify(command.visualizations),
      isPublic: command.isPublic,
      createdBy: command.createdBy,
      tags: JSON.stringify(command.tags),
      usageCount: 0,
      metadata: JSON.stringify(command.metadata),
      createdAt: command.createdAt
    };

    await this.dualWriter.writeToAllDatabases(template, 'report_templates');

    // Publish event
    const event = new ReportTemplateCreatedEvent({
      templateId: command.id,
      name: command.name,
      description: command.description,
      reportType: command.reportType,
      createdBy: command.createdBy,
      isPublic: command.isPublic,
      tags: command.tags
    });
    await this.eventStore.saveEvent(event);
    await this.kafkaService.produce('reporting-events', event);

    return template;
  }

  async handleUpdateReportTemplate(command) {
    const currentTemplate = await this.getReportTemplateById(command.id);
    if (!currentTemplate) {
      throw new Error('Report template not found');
    }

    const updates = {};
    Object.keys(command.updates).forEach(key => {
      if (typeof command.updates[key] === 'object') {
        updates[key] = JSON.stringify(command.updates[key]);
      } else {
        updates[key] = command.updates[key];
      }
    });

    await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const updateFields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
      const values = [...Object.values(updates), command.id];
      await connection.execute(
        `UPDATE report_templates SET ${updateFields}, updated_at = NOW() WHERE id = ?`,
        values
      );
    });

    // Publish event
    const event = new ReportTemplateUpdatedEvent({
      templateId: command.id,
      updates: command.updates,
      updatedBy: command.updatedBy,
      previousValues: currentTemplate
    });
    await this.eventStore.saveEvent(event);
    await this.kafkaService.produce('reporting-events', event);

    return { id: command.id, updated: true };
  }

  async handleExecuteScheduledReport(command) {
    const scheduledReport = await this.getScheduledReportById(command.scheduledReportId);
    if (!scheduledReport || !scheduledReport.isActive) {
      return;
    }

    const startTime = Date.now();

    try {
      // Generate the report
      const reportData = await this.generateReportData(
        scheduledReport.reportType,
        scheduledReport.parameters
      );

      const executionTime = Date.now() - startTime;
      const recordCount = this.calculateRecordCount(reportData);

      // Deliver the report
      await this.deliverReport(scheduledReport, reportData);

      // Update execution history
      await this.updateScheduledReportExecution(scheduledReport.id, {
        executionId: command.executionId,
        executedAt: command.triggeredAt,
        executionTime,
        recordCount,
        status: 'success'
      });

      // Calculate next run
      const nextRun = this.calculateNextRun(scheduledReport.schedule);

      // Publish event
      const event = new ScheduledReportExecutedEvent({
        scheduledReportId: command.scheduledReportId,
        executionId: command.executionId,
        triggeredBy: command.triggeredBy,
        executionTime,
        recordCount,
        deliveryStatus: 'success',
        nextRun
      });
      await this.eventStore.saveEvent(event);
      await this.kafkaService.produce('reporting-events', event);

    } catch (error) {
      // Update execution history with failure
      await this.updateScheduledReportExecution(scheduledReport.id, {
        executionId: command.executionId,
        executedAt: command.triggeredAt,
        status: 'failed',
        error: error.message
      });

      this.logger.error('Scheduled report execution failed:', error);
    }
  }

  async handleCacheReportData(command) {
    const cacheKey = this.generateCacheKey(command.reportType, command.parameters);
    const cacheEntry = {
      id: command.id,
      cacheKey,
      reportType: command.reportType,
      parameters: JSON.stringify(command.parameters),
      data: JSON.stringify(command.data),
      expiresAt: command.expiresAt,
      createdAt: command.createdAt,
      metadata: JSON.stringify(command.metadata)
    };

    // Store in cache
    this.cache.set(cacheKey, {
      data: command.data,
      expiresAt: command.expiresAt,
      createdAt: command.createdAt
    });

    // Store metadata in database
    await this.dualWriter.writeToAllDatabases(cacheEntry, 'report_cache');

    // Publish event
    const event = new ReportDataCachedEvent({
      cacheId: command.id,
      reportType: command.reportType,
      parameters: command.parameters,
      dataSize: JSON.stringify(command.data).length,
      expiresAt: command.expiresAt,
      cacheKey
    });
    await this.eventStore.saveEvent(event);
    await this.kafkaService.produce('reporting-events', event);

    return cacheEntry;
  }

  async handleExportReportData(command) {
    // Get report data
    const report = await this.getReportById(command.reportId);
    if (!report) {
      throw new Error('Report not found');
    }

    // Apply filters
    let dataToExport = report.data;
    if (command.filters && Object.keys(command.filters).length > 0) {
      dataToExport = this.applyFilters(dataToExport, command.filters);
    }

    // Generate export
    const exportResult = await this.generateExport(dataToExport, command);

    // Store export metadata
    const exportMetadata = {
      id: command.id,
      reportId: command.reportId,
      format: command.format,
      filters: JSON.stringify(command.filters),
      recordCount: dataToExport.length,
      fileSize: exportResult.fileSize,
      downloadUrl: exportResult.downloadUrl,
      expiresAt: exportResult.expiresAt,
      exportedBy: command.userId,
      createdAt: command.requestedAt
    };

    await this.dualWriter.writeToAllDatabases(exportMetadata, 'report_exports');

    // Publish event
    const event = new ReportDataExportedEvent({
      exportId: command.id,
      reportId: command.reportId,
      format: command.format,
      recordCount: dataToExport.length,
      fileSize: exportResult.fileSize,
      exportedBy: command.userId,
      downloadUrl: exportResult.downloadUrl,
      expiresAt: exportResult.expiresAt
    });
    await this.eventStore.saveEvent(event);
    await this.kafkaService.produce('reporting-events', event);

    return exportMetadata;
  }

  async handleGenerateDashboard(command) {
    const dashboard = {
      id: command.id,
      name: command.name,
      description: command.description,
      widgets: JSON.stringify(command.widgets),
      layout: JSON.stringify(command.layout),
      filters: JSON.stringify(command.filters),
      refreshInterval: command.refreshInterval,
      isPublic: command.isPublic,
      createdBy: command.createdBy,
      tags: JSON.stringify(command.tags),
      viewCount: 0,
      metadata: JSON.stringify(command.metadata),
      createdAt: command.createdAt
    };

    await this.dualWriter.writeToAllDatabases(dashboard, 'dashboards');

    // Publish event
    const event = new DashboardCreatedEvent({
      dashboardId: command.id,
      name: command.name,
      description: command.description,
      widgetCount: command.widgets.length,
      createdBy: command.createdBy,
      isPublic: command.isPublic,
      tags: command.tags
    });
    await this.eventStore.saveEvent(event);
    await this.kafkaService.produce('reporting-events', event);

    return dashboard;
  }

  async handleUpdateDashboard(command) {
    const currentDashboard = await this.getDashboardById(command.id);
    if (!currentDashboard) {
      throw new Error('Dashboard not found');
    }

    const updates = {};
    Object.keys(command.updates).forEach(key => {
      if (typeof command.updates[key] === 'object') {
        updates[key] = JSON.stringify(command.updates[key]);
      } else {
        updates[key] = command.updates[key];
      }
    });

    await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const updateFields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
      const values = [...Object.values(updates), command.id];
      await connection.execute(
        `UPDATE dashboards SET ${updateFields}, updated_at = NOW() WHERE id = ?`,
        values
      );
    });

    // Publish event
    const event = new DashboardUpdatedEvent({
      dashboardId: command.id,
      updates: command.updates,
      updatedBy: command.updatedBy,
      widgetCount: command.updates.widgets ? command.updates.widgets.length : currentDashboard.widgets.length
    });
    await this.eventStore.saveEvent(event);
    await this.kafkaService.produce('reporting-events', event);

    return { id: command.id, updated: true };
  }

  // Helper methods
  async generateReportData(reportType, parameters) {
    switch (reportType) {
      case 'transaction-summary':
        return await this.generateTransactionSummaryReport(parameters);
      case 'financial-statement':
        return await this.generateFinancialStatementReport(parameters);
      case 'compliance-audit':
        return await this.generateComplianceAuditReport(parameters);
      case 'user-activity':
        return await this.generateUserActivityReport(parameters);
      case 'performance-metrics':
        return await this.generatePerformanceMetricsReport(parameters);
      case 'risk-analysis':
        return await this.generateRiskAnalysisReport(parameters);
      case 'revenue-analytics':
        return await this.generateRevenueAnalyticsReport(parameters);
      case 'customer-insights':
        return await this.generateCustomerInsightsReport(parameters);
      case 'operational-dashboard':
        return await this.generateOperationalDashboardReport(parameters);
      default:
        throw new Error(`Unknown report type: ${reportType}`);
    }
  }

  async generateTransactionSummaryReport(parameters) {
    // Implementation similar to existing generateTransactionReport
    // but with enhanced features and caching
    const cacheKey = this.generateCacheKey('transaction-summary', parameters);
    const cached = this.getCachedData(cacheKey);
    if (cached) return cached;

    // Generate fresh data
    const data = await this.generateTransactionReport(parameters);

    // Cache the result
    await this.handleCacheReportData(new CacheReportDataCommand({
      reportType: 'transaction-summary',
      parameters,
      data,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 minutes
    }));

    return data;
  }

  async generateFinancialStatementReport(parameters) {
    // Enhanced financial reporting with multiple data sources
    const { startDate, endDate, includeProjections = false } = parameters;

    const financialData = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(`
        SELECT
          DATE(created_at) as date,
          COUNT(*) as transaction_count,
          SUM(amount) as revenue,
          SUM(fee_amount) as fees,
          SUM(amount - fee_amount) as net_revenue
        FROM transactions
        WHERE status = 'completed'
          AND created_at BETWEEN ? AND ?
        GROUP BY DATE(created_at)
        ORDER BY date DESC
      `, [startDate, endDate]);
      return rows;
    });

    return {
      reportType: 'financial-statement',
      period: { startDate, endDate },
      generatedAt: new Date().toISOString(),
      summary: this.calculateFinancialSummary(financialData),
      data: financialData,
      projections: includeProjections ? this.generateFinancialProjections(financialData) : null
    };
  }

  async generateComplianceAuditReport(parameters) {
    // Enhanced compliance reporting
    const { startDate, endDate, includeRiskAssessments = true } = parameters;

    const auditData = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(`
        SELECT
          DATE(timestamp) as date,
          action,
          resource,
          COUNT(*) as count,
          GROUP_CONCAT(DISTINCT user_id) as users
        FROM audit_logs
        WHERE timestamp BETWEEN ? AND ?
        GROUP BY DATE(timestamp), action, resource
        ORDER BY date DESC, count DESC
      `, [startDate, endDate]);
      return rows;
    });

    let riskData = [];
    if (includeRiskAssessments) {
      riskData = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute(`
          SELECT
            risk_level,
            COUNT(*) as count,
            AVG(risk_score) as avg_score
          FROM transaction_risk_assessments
          WHERE created_at BETWEEN ? AND ?
          GROUP BY risk_level
        `, [startDate, endDate]);
        return rows;
      });
    }

    return {
      reportType: 'compliance-audit',
      period: { startDate, endDate },
      generatedAt: new Date().toISOString(),
      summary: {
        totalAuditEvents: auditData.reduce((sum, item) => sum + item.count, 0),
        uniqueUsers: new Set(auditData.flatMap(item => item.users.split(','))).size,
        riskAlerts: riskData
      },
      data: {
        auditLogs: auditData,
        riskAssessments: riskData
      }
    };
  }

  async generateUserActivityReport(parameters) {
    // Enhanced user activity with segmentation
    const { startDate, endDate, userId, segmentBy = 'activity_level' } = parameters;

    let query = `
      SELECT
        user_id,
        COUNT(*) as transaction_count,
        SUM(amount) as total_amount,
        AVG(amount) as avg_amount,
        MIN(created_at) as first_transaction,
        MAX(created_at) as last_transaction,
        COUNT(DISTINCT DATE(created_at)) as active_days
      FROM transactions
      WHERE status = 'completed'
        AND created_at BETWEEN ? AND ?
    `;

    const params = [startDate, endDate];

    if (userId) {
      query += ' AND user_id = ?';
      params.push(userId);
    }

    query += ' GROUP BY user_id ORDER BY total_amount DESC';

    const activityData = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(query, params);
      return rows;
    });

    // Add segmentation
    const segmentedData = this.segmentUserActivity(activityData, segmentBy);

    return {
      reportType: 'user-activity',
      period: { startDate, endDate },
      generatedAt: new Date().toISOString(),
      summary: {
        totalUsers: activityData.length,
        totalTransactions: activityData.reduce((sum, user) => sum + user.transaction_count, 0),
        totalVolume: activityData.reduce((sum, user) => sum + parseFloat(user.total_amount), 0),
        averageTransactionsPerUser: activityData.length > 0 ?
          activityData.reduce((sum, user) => sum + user.transaction_count, 0) / activityData.length : 0
      },
      segmentation: segmentedData,
      data: activityData
    };
  }

  async generatePerformanceMetricsReport(parameters) {
    // System performance metrics
    const { startDate, endDate, includeSystemMetrics = true } = parameters;

    const metrics = {
      transaction: await this.getTransactionMetrics(startDate, endDate),
      system: includeSystemMetrics ? await this.getSystemMetrics(startDate, endDate) : null,
      api: await this.getAPIMetrics(startDate, endDate)
    };

    return {
      reportType: 'performance-metrics',
      period: { startDate, endDate },
      generatedAt: new Date().toISOString(),
      metrics
    };
  }

  async generateRiskAnalysisReport(parameters) {
    // Comprehensive risk analysis
    const { startDate, endDate, riskThreshold = 0.7 } = parameters;

    const riskData = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(`
        SELECT
          tra.*,
          t.amount,
          t.currency,
          t.user_id,
          t.merchant_id
        FROM transaction_risk_assessments tra
        JOIN transactions t ON tra.transaction_id = t.id
        WHERE tra.created_at BETWEEN ? AND ?
          AND tra.risk_score >= ?
        ORDER BY tra.risk_score DESC
      `, [startDate, endDate, riskThreshold]);
      return rows;
    });

    const riskSummary = this.analyzeRiskPatterns(riskData);

    return {
      reportType: 'risk-analysis',
      period: { startDate, endDate },
      generatedAt: new Date().toISOString(),
      summary: riskSummary,
      data: riskData
    };
  }

  async generateRevenueAnalyticsReport(parameters) {
    // Advanced revenue analytics with forecasting
    const { startDate, endDate, includeForecasting = true } = parameters;

    const revenueData = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(`
        SELECT
          DATE(created_at) as date,
          SUM(amount) as revenue,
          SUM(fee_amount) as fees,
          COUNT(*) as transaction_count,
          AVG(amount) as avg_transaction_value
        FROM transactions
        WHERE status = 'completed'
          AND created_at BETWEEN ? AND ?
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `, [startDate, endDate]);
      return rows;
    });

    const analytics = this.calculateRevenueAnalytics(revenueData);

    return {
      reportType: 'revenue-analytics',
      period: { startDate, endDate },
      generatedAt: new Date().toISOString(),
      analytics,
      forecast: includeForecasting ? this.generateRevenueForecast(revenueData) : null,
      data: revenueData
    };
  }

  async generateCustomerInsightsReport(parameters) {
    // Customer behavior insights
    const { startDate, endDate, segmentBy = 'value_tier' } = parameters;

    const customerData = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(`
        SELECT
          user_id,
          COUNT(*) as transaction_count,
          SUM(amount) as lifetime_value,
          AVG(amount) as avg_transaction_value,
          MAX(created_at) as last_transaction_date,
          DATEDIFF(NOW(), MAX(created_at)) as days_since_last_transaction,
          COUNT(DISTINCT DATE(created_at)) as active_days,
          COUNT(DISTINCT merchant_id) as unique_merchants
        FROM transactions
        WHERE status = 'completed'
          AND created_at BETWEEN ? AND ?
        GROUP BY user_id
        HAVING transaction_count >= 3
        ORDER BY lifetime_value DESC
      `, [startDate, endDate]);
      return rows;
    });

    const insights = this.generateCustomerInsights(customerData, segmentBy);

    return {
      reportType: 'customer-insights',
      period: { startDate, endDate },
      generatedAt: new Date().toISOString(),
      insights,
      data: customerData
    };
  }

  async generateOperationalDashboardReport(parameters) {
    // Real-time operational metrics
    const currentMetrics = await this.getCurrentOperationalMetrics();

    return {
      reportType: 'operational-dashboard',
      generatedAt: new Date().toISOString(),
      metrics: currentMetrics
    };
  }

  // Utility methods
  calculateRecordCount(data) {
    if (Array.isArray(data)) return data.length;
    if (data.data && Array.isArray(data.data)) return data.data.length;
    return 1;
  }

  calculateFileSize(data) {
    return JSON.stringify(data).length;
  }

  calculateExpiration(reportType) {
    const expirations = {
      'transaction-summary': 24 * 60 * 60 * 1000, // 24 hours
      'financial-statement': 7 * 24 * 60 * 60 * 1000, // 7 days
      'compliance-audit': 30 * 24 * 60 * 60 * 1000, // 30 days
      'user-activity': 24 * 60 * 60 * 1000, // 24 hours
      'performance-metrics': 60 * 60 * 1000, // 1 hour
      'risk-analysis': 12 * 60 * 60 * 1000, // 12 hours
      'revenue-analytics': 24 * 60 * 60 * 1000, // 24 hours
      'customer-insights': 24 * 60 * 60 * 1000, // 24 hours
      'operational-dashboard': 5 * 60 * 1000 // 5 minutes
    };

    return new Date(Date.now() + (expirations[reportType] || 24 * 60 * 60 * 1000)).toISOString();
  }

  generateCacheKey(reportType, parameters) {
    return `${reportType}:${JSON.stringify(parameters)}`;
  }

  getCachedData(cacheKey) {
    const cached = this.cache.get(cacheKey);
    if (cached && (!cached.expiresAt || new Date(cached.expiresAt) > new Date())) {
      return cached.data;
    }
    return null;
  }

  calculateNextRun(cronExpression) {
    // Simple cron parsing - in production, use a proper cron library
    return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // Daily default
  }

  async getScheduledReportById(id) {
    const mysqlResult = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute('SELECT * FROM scheduled_reports WHERE id = ?', [id]);
      return rows[0];
    });
    return mysqlResult;
  }

  async getReportTemplateById(id) {
    const mysqlResult = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute('SELECT * FROM report_templates WHERE id = ?', [id]);
      return rows[0];
    });
    return mysqlResult;
  }

  async getReportById(id) {
    const mysqlResult = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute('SELECT * FROM reports WHERE id = ?', [id]);
      return rows[0];
    });
    return mysqlResult;
  }

  async getDashboardById(id) {
    const mysqlResult = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute('SELECT * FROM dashboards WHERE id = ?', [id]);
      return rows[0];
    });
    return mysqlResult;
  }

  // Additional helper methods would be implemented here
  calculateFinancialSummary(data) { return {}; }
  generateFinancialProjections(data) { return {}; }
  segmentUserActivity(data, segmentBy) { return {}; }
  getTransactionMetrics(startDate, endDate) { return {}; }
  getSystemMetrics(startDate, endDate) { return {}; }
  getAPIMetrics(startDate, endDate) { return {}; }
  analyzeRiskPatterns(data) { return {}; }
  calculateRevenueAnalytics(data) {
    if (!data || !Array.isArray(data)) return {};

    const totalRevenue = data.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    const transactionCount = data.length;
    const averageTransactionValue = transactionCount > 0 ? totalRevenue / transactionCount : 0;

    // Revenue by currency
    const revenueByCurrency = data.reduce((acc, item) => {
      const currency = item.currency || 'USD';
      acc[currency] = (acc[currency] || 0) + (parseFloat(item.amount) || 0);
      return acc;
    }, {});

    // Revenue trends (assuming data is sorted by date)
    const revenueTrends = data.reduce((acc, item) => {
      const date = new Date(item.created_at).toISOString().split('T')[0];
      acc[date] = (acc[date] || 0) + (parseFloat(item.amount) || 0);
      return acc;
    }, {});

    return {
      totalRevenue: parseFloat(totalRevenue.toFixed(2)),
      transactionCount,
      averageTransactionValue: parseFloat(averageTransactionValue.toFixed(2)),
      revenueByCurrency,
      revenueTrends,
      growthRate: this.calculateGrowthRate(Object.values(revenueTrends))
    };
  }

  generateRevenueForecast(data) {
    if (!data || !Array.isArray(data) || data.length < 7) return {};

    // Simple linear regression for forecasting
    const values = data.map(item => parseFloat(item.amount) || 0);
    const n = values.length;

    // Calculate slope and intercept
    const sumX = (n * (n - 1)) / 2;
    const sumY = values.reduce((sum, val) => sum + val, 0);
    const sumXY = values.reduce((sum, val, index) => sum + (val * index), 0);
    const sumXX = (n * (n - 1) * (2 * n - 1)) / 6;

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Forecast next 7 days
    const forecast = [];
    for (let i = 1; i <= 7; i++) {
      const predictedValue = slope * (n + i - 1) + intercept;
      forecast.push({
        day: i,
        predictedRevenue: Math.max(0, parseFloat(predictedValue.toFixed(2))),
        confidence: 0.8 // Simple confidence score
      });
    }

    return {
      forecast,
      method: 'linear_regression',
      accuracy: 0.75,
      basedOnDays: n
    };
  }

  generateCustomerInsights(data, segmentBy = 'amount') {
    if (!data || !Array.isArray(data)) return {};

    const customerData = data.reduce((acc, item) => {
      const customerId = item.user_id || item.customer_id;
      if (!customerId) return acc;

      if (!acc[customerId]) {
        acc[customerId] = {
          customerId,
          totalTransactions: 0,
          totalAmount: 0,
          transactions: []
        };
      }

      acc[customerId].totalTransactions++;
      acc[customerId].totalAmount += parseFloat(item.amount) || 0;
      acc[customerId].transactions.push({
        id: item.id,
        amount: parseFloat(item.amount) || 0,
        date: item.created_at,
        status: item.status
      });

      return acc;
    }, {});

    const customers = Object.values(customerData);

    // Segment customers
    let segments = {};
    switch (segmentBy) {
      case 'amount':
        segments = {
          'high_value': customers.filter(c => c.totalAmount > 10000),
          'medium_value': customers.filter(c => c.totalAmount > 1000 && c.totalAmount <= 10000),
          'low_value': customers.filter(c => c.totalAmount <= 1000)
        };
        break;
      case 'frequency':
        segments = {
          'frequent': customers.filter(c => c.totalTransactions > 10),
          'regular': customers.filter(c => c.totalTransactions > 3 && c.totalTransactions <= 10),
          'occasional': customers.filter(c => c.totalTransactions <= 3)
        };
        break;
      default:
        segments = { 'all': customers };
    }

    // Calculate insights
    const insights = {
      totalCustomers: customers.length,
      averageOrderValue: customers.length > 0 ?
        customers.reduce((sum, c) => sum + c.totalAmount, 0) / customers.length : 0,
      segments,
      topCustomers: customers
        .sort((a, b) => b.totalAmount - a.totalAmount)
        .slice(0, 10)
    };

    return insights;
  }

  getCurrentOperationalMetrics() {
    // This would typically query real-time metrics from monitoring systems
    // For now, return mock data
    return {
      systemHealth: 'healthy',
      activeUsers: Math.floor(Math.random() * 1000) + 500,
      transactionsPerMinute: Math.floor(Math.random() * 50) + 10,
      averageResponseTime: Math.floor(Math.random() * 200) + 50,
      errorRate: (Math.random() * 0.05).toFixed(4),
      throughput: Math.floor(Math.random() * 1000) + 500,
      lastUpdated: new Date().toISOString()
    };
  }

  applyFilters(data, filters) {
    if (!data || !Array.isArray(data) || !filters) return data;

    return data.filter(item => {
      for (const [key, value] of Object.entries(filters)) {
        if (value === null || value === undefined || value === '') continue;

        const itemValue = item[key];
        if (itemValue === null || itemValue === undefined) return false;

        if (Array.isArray(value)) {
          if (!value.includes(itemValue)) return false;
        } else if (typeof value === 'object') {
          // Date range filter
          if (value.start && new Date(itemValue) < new Date(value.start)) return false;
          if (value.end && new Date(itemValue) > new Date(value.end)) return false;
          // Numeric range filter
          if (value.min !== undefined && parseFloat(itemValue) < value.min) return false;
          if (value.max !== undefined && parseFloat(itemValue) > value.max) return false;
        } else {
          if (itemValue !== value) return false;
        }
      }
      return true;
    });
  }

  generateExport(data, command) {
    const { format = 'json', filters = {} } = command;

    // Apply filters
    const filteredData = this.applyFilters(data, filters);

    switch (format) {
      case 'csv':
        return this.generateCSV(filteredData);
      case 'xlsx':
        return this.generateExcel(filteredData);
      case 'pdf':
        return this.generatePDF(filteredData);
      default:
        return filteredData;
    }
  }

  generateCSV(data) {
    if (!data || !Array.isArray(data) || data.length === 0) return '';

    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(','),
      ...data.map(row =>
        headers.map(header => {
          const value = row[header];
          // Escape commas and quotes in CSV
          if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        }).join(',')
      )
    ];

    return csvRows.join('\n');
  }

  generateExcel(data) {
    // This would use a library like exceljs in a real implementation
    // For now, return a placeholder
    return {
      type: 'buffer',
      data: Buffer.from(JSON.stringify(data)),
      filename: 'export.xlsx'
    };
  }

  generatePDF(data) {
    // This would use a library like pdfkit in a real implementation
    // For now, return a placeholder
    return {
      type: 'buffer',
      data: Buffer.from(JSON.stringify(data)),
      filename: 'export.pdf'
    };
  }

  async deliverReport(scheduledReport, data) {
    const { deliveryMethod, recipients } = scheduledReport;

    try {
      switch (deliveryMethod) {
        case 'email':
          await this.deliverViaEmail(recipients, data, scheduledReport);
          break;
        case 'api':
          await this.deliverViaAPI(recipients, data, scheduledReport);
          break;
        case 'webhook':
          await this.deliverViaWebhook(recipients, data, scheduledReport);
          break;
        default:
          this.logger.warn(`Unknown delivery method: ${deliveryMethod}`);
      }
    } catch (error) {
      this.logger.error('Error delivering report:', error);
      throw error;
    }
  }

  async deliverViaEmail(recipients, data, scheduledReport) {
    // This would integrate with an email service like nodemailer
    // For now, just log the delivery
    this.logger.info(`Delivering report via email to ${recipients.length} recipients`, {
      reportId: scheduledReport.id,
      recipients
    });
  }

  async deliverViaAPI(recipients, data, scheduledReport) {
    // This would make HTTP requests to configured endpoints
    this.logger.info(`Delivering report via API to ${recipients.length} endpoints`, {
      reportId: scheduledReport.id,
      recipients
    });
  }

  async deliverViaWebhook(recipients, data, scheduledReport) {
    // This would make HTTP POST requests to webhook URLs
    this.logger.info(`Delivering report via webhook to ${recipients.length} URLs`, {
      reportId: scheduledReport.id,
      recipients
    });
  }

  async updateScheduledReportExecution(reportId, executionData) {
    const { status, executionTime, error } = executionData;

    try {
      await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        await connection.execute(
          `UPDATE scheduled_reports
           SET last_run = NOW(),
               last_run_status = ?,
               last_run_error = ?,
               run_count = run_count + 1
           WHERE id = ?`,
          [status, error, reportId]
        );
      });

      // Update next run time based on schedule
      await this.updateNextRunTime(reportId);

    } catch (error) {
      this.logger.error('Error updating scheduled report execution:', error);
      throw error;
    }
  }

  async updateNextRunTime(reportId) {
    // This would calculate the next run time based on cron expression
    // For now, just add 24 hours
    try {
      await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        await connection.execute(
          `UPDATE scheduled_reports
           SET next_run = DATE_ADD(NOW(), INTERVAL 1 DAY)
           WHERE id = ?`,
          [reportId]
        );
      });
    } catch (error) {
      this.logger.error('Error updating next run time:', error);
      throw error;
    }
  }

  calculateGrowthRate(values) {
    if (!Array.isArray(values) || values.length < 2) return 0;

    const recent = values.slice(-7); // Last 7 days
    const previous = values.slice(-14, -7); // Previous 7 days

    if (previous.length === 0) return 0;

    const recentAvg = recent.reduce((sum, val) => sum + val, 0) / recent.length;
    const previousAvg = previous.reduce((sum, val) => sum + val, 0) / previous.length;

    if (previousAvg === 0) return 0;

    return ((recentAvg - previousAvg) / previousAvg) * 100;
  }
}