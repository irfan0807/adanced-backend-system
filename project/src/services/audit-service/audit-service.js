import { AuditCommandHandler } from './handlers/audit-command-handler.js';
import { AuditQueryHandler } from './handlers/audit-query-handler.js';

export class AuditService {
  constructor(dependencies) {
    this.connectionPool = dependencies.connectionPool;
    this.dualWriter = dependencies.dualWriter;
    this.eventStore = dependencies.eventStore;
    this.kafkaService = dependencies.kafkaService;
    this.commandBus = dependencies.commandBus;
    this.queryBus = dependencies.queryBus;
    this.logger = dependencies.logger;

    this.commandHandler = new AuditCommandHandler(dependencies);
    this.queryHandler = new AuditQueryHandler(dependencies);

    this.cache = new Map();
    this.healthStatus = 'initializing';
  }

  async initialize() {
    try {
      this.logger.info('Initializing Audit Service...');

      // Register command handlers
      this.commandBus.registerHandler('LogAuditEventCommand', this.commandHandler);
      this.commandBus.registerHandler('BulkLogAuditEventsCommand', this.commandHandler);
      this.commandBus.registerHandler('ArchiveAuditLogsCommand', this.commandHandler);
      this.commandBus.registerHandler('PurgeAuditLogsCommand', this.commandHandler);
      this.commandBus.registerHandler('FlagSuspiciousActivityCommand', this.commandHandler);
      this.commandBus.registerHandler('GenerateAuditReportCommand', this.commandHandler);
      this.commandBus.registerHandler('UpdateAuditRetentionPolicyCommand', this.commandHandler);

      // Register query handlers
      this.queryBus.registerHandler('GetAuditLogsQuery', this.queryHandler);
      this.queryBus.registerHandler('GetAuditLogByIdQuery', this.queryHandler);
      this.queryBus.registerHandler('GetUserAuditTrailQuery', this.queryHandler);
      this.queryBus.registerHandler('GetResourceAuditTrailQuery', this.queryHandler);
      this.queryBus.registerHandler('GetAuditStatisticsQuery', this.queryHandler);
      this.queryBus.registerHandler('GetSuspiciousActivitiesQuery', this.queryHandler);
      this.queryBus.registerHandler('GetComplianceReportQuery', this.queryHandler);
      this.queryBus.registerHandler('GetAuditRetentionStatusQuery', this.queryHandler);
      this.queryBus.registerHandler('GetSystemAccessLogQuery', this.queryHandler);
      this.queryBus.registerHandler('GetDataAccessAuditQuery', this.queryHandler);

      // Set up event consumers for real-time processing
      await this.setupEventConsumers();

      // Initialize retention policies
      await this.initializeRetentionPolicies();

      this.healthStatus = 'healthy';
      this.logger.info('Audit Service initialized successfully');
    } catch (error) {
      this.healthStatus = 'unhealthy';
      this.logger.error('Failed to initialize Audit Service:', error);
      throw error;
    }
  }

  // Command methods
  async logAuditEvent(data) {
    const command = await import('./commands/audit-commands.js').then(m => new m.LogAuditEventCommand(data));
    return await this.commandBus.execute(command);
  }

  async bulkLogAuditEvents(data) {
    const command = await import('./commands/audit-commands.js').then(m => new m.BulkLogAuditEventsCommand(data));
    return await this.commandBus.execute(command);
  }

  async archiveAuditLogs(data) {
    const command = await import('./commands/audit-commands.js').then(m => new m.ArchiveAuditLogsCommand(data));
    return await this.commandBus.execute(command);
  }

  async purgeAuditLogs(data) {
    const command = await import('./commands/audit-commands.js').then(m => new m.PurgeAuditLogsCommand(data));
    return await this.commandBus.execute(command);
  }

  async flagSuspiciousActivity(data) {
    const command = await import('./commands/audit-commands.js').then(m => new m.FlagSuspiciousActivityCommand(data));
    return await this.commandBus.execute(command);
  }

  async generateAuditReport(data) {
    const command = await import('./commands/audit-commands.js').then(m => new m.GenerateAuditReportCommand(data));
    return await this.commandBus.execute(command);
  }

  async updateAuditRetentionPolicy(data) {
    const command = await import('./commands/audit-commands.js').then(m => new m.UpdateAuditRetentionPolicyCommand(data));
    return await this.commandBus.execute(command);
  }

  // Query methods
  async getAuditLogs(data) {
    const query = await import('./queries/audit-queries.js').then(m => new m.GetAuditLogsQuery(data));
    return await this.queryBus.execute(query);
  }

  async getAuditLogById(data) {
    const query = await import('./queries/audit-queries.js').then(m => new m.GetAuditLogByIdQuery(data));
    return await this.queryBus.execute(query);
  }

  async getUserAuditTrail(data) {
    const query = await import('./queries/audit-queries.js').then(m => new m.GetUserAuditTrailQuery(data));
    return await this.queryBus.execute(query);
  }

  async getResourceAuditTrail(data) {
    const query = await import('./queries/audit-queries.js').then(m => new m.GetResourceAuditTrailQuery(data));
    return await this.queryBus.execute(query);
  }

  async getAuditStatistics(data) {
    const query = await import('./queries/audit-queries.js').then(m => new m.GetAuditStatisticsQuery(data));
    return await this.queryBus.execute(query);
  }

  async getSuspiciousActivities(data) {
    const query = await import('./queries/audit-queries.js').then(m => new m.GetSuspiciousActivitiesQuery(data));
    return await this.queryBus.execute(query);
  }

  async getComplianceReport(data) {
    const query = await import('./queries/audit-queries.js').then(m => new m.GetComplianceReportQuery(data));
    return await this.queryBus.execute(query);
  }

  async getAuditRetentionStatus(data) {
    const query = await import('./queries/audit-queries.js').then(m => new m.GetAuditRetentionStatusQuery(data));
    return await this.queryBus.execute(query);
  }

  async getSystemAccessLog(data) {
    const query = await import('./queries/audit-queries.js').then(m => new m.GetSystemAccessLogQuery(data));
    return await this.queryBus.execute(query);
  }

  async getDataAccessAudit(data) {
    const query = await import('./queries/audit-queries.js').then(m => new m.GetDataAccessAuditQuery(data));
    return await this.queryBus.execute(query);
  }

  // Event consumer setup
  async setupEventConsumers() {
    const eventMappings = {
      'user-events': this.handleUserEvent.bind(this),
      'account-events': this.handleAccountEvent.bind(this),
      'transaction-events': this.handleTransactionEvent.bind(this),
      'payment-events': this.handlePaymentEvent.bind(this),
      'system-events': this.handleSystemEvent.bind(this),
      'security-events': this.handleSecurityEvent.bind(this)
    };

    for (const [topic, handler] of Object.entries(eventMappings)) {
      await this.kafkaService.consumeMessages(topic, 'audit-service-group', async (message) => {
        try {
          const event = JSON.parse(message.value.toString());
          await handler(event);
        } catch (error) {
          this.logger.error(`Error processing ${topic} event:`, error);
        }
      });
    }

    this.logger.info('Audit event consumers set up');
  }

  // Event handlers
  async handleUserEvent(event) {
    const auditData = {
      userId: event.userId,
      action: event.eventType.replace('USER_', '').replace('_', ' '),
      resource: 'USER',
      resourceId: event.userId,
      details: event,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      metadata: { source: 'user-service' }
    };

    await this.logAuditEvent(auditData);
  }

  async handleAccountEvent(event) {
    const auditData = {
      userId: event.userId,
      action: event.eventType.replace('ACCOUNT_', '').replace('_', ' '),
      resource: 'ACCOUNT',
      resourceId: event.accountId,
      details: event,
      metadata: { source: 'account-service' }
    };

    await this.logAuditEvent(auditData);
  }

  async handleTransactionEvent(event) {
    const auditData = {
      userId: event.userId,
      action: event.eventType.replace('TRANSACTION_', '').replace('_', ' '),
      resource: 'TRANSACTION',
      resourceId: event.transactionId,
      details: event,
      metadata: { source: 'transaction-service' }
    };

    await this.logAuditEvent(auditData);
  }

  async handlePaymentEvent(event) {
    const auditData = {
      userId: event.userId,
      action: event.eventType.replace('PAYMENT_', '').replace('_', ' '),
      resource: 'PAYMENT',
      resourceId: event.paymentId,
      details: event,
      metadata: { source: 'payment-service' }
    };

    await this.logAuditEvent(auditData);
  }

  async handleSystemEvent(event) {
    const auditData = {
      userId: event.userId || 'system',
      action: event.eventType.replace('SYSTEM_', '').replace('_', ' '),
      resource: 'SYSTEM',
      resourceId: event.componentId,
      details: event,
      metadata: { source: 'system' }
    };

    await this.logAuditEvent(auditData);
  }

  async handleSecurityEvent(event) {
    const auditData = {
      userId: event.userId,
      action: 'SECURITY_ALERT',
      resource: 'SECURITY',
      resourceId: event.alertId,
      details: event,
      riskScore: event.riskScore || 80,
      complianceFlags: ['SECURITY_INCIDENT'],
      metadata: { source: 'security-service' }
    };

    await this.logAuditEvent(auditData);

    // Flag as suspicious activity if high risk
    if (event.riskScore > 70) {
      await this.flagSuspiciousActivity({
        auditLogId: null, // Will be set after logging
        userId: event.userId,
        activityType: 'security_alert',
        severity: event.severity || 'high',
        riskScore: event.riskScore,
        indicators: event.indicators || [],
        metadata: { source: 'security-service' }
      });
    }
  }

  // Retention policy management
  async initializeRetentionPolicies() {
    // Set up default retention policies
    const defaultPolicies = [
      {
        category: 'user-activity',
        retentionDays: 2555, // 7 years
        complianceRequirements: ['GDPR', 'SOX']
      },
      {
        category: 'financial-transactions',
        retentionDays: 2555, // 7 years
        complianceRequirements: ['SOX', 'PCI-DSS']
      },
      {
        category: 'security-events',
        retentionDays: 2555, // 7 years
        complianceRequirements: ['ISO27001', 'NIST']
      },
      {
        category: 'system-logs',
        retentionDays: 1095, // 3 years
        complianceRequirements: []
      }
    ];

    for (const policy of defaultPolicies) {
      await this.updateAuditRetentionPolicy({
        policyId: `default-${policy.category}`,
        name: `${policy.category.replace('-', ' ').toUpperCase()} Retention Policy`,
        description: `Default retention policy for ${policy.category}`,
        retentionRules: [policy],
        complianceRequirements: policy.complianceRequirements,
        autoArchive: true,
        autoPurge: false,
        approvedBy: 'system'
      });
    }

    this.logger.info('Default retention policies initialized');
  }

  // Health and monitoring
  async getAuditHealthStatus() {
    try {
      // Check database connectivity
      await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        await connection.execute('SELECT 1');
      });

      // Check event store
      const recentEvents = await this.eventStore.getEvents('audit-events', 1);

      // Get basic statistics
      const stats = await this.getAuditStatistics({
        startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Last 24 hours
        endDate: new Date().toISOString(),
        metrics: ['total_events', 'unique_users']
      });

      return {
        status: 'healthy',
        service: 'audit-service',
        timestamp: new Date().toISOString(),
        database: {
          status: 'connected',
          stats: this.connectionPool.getStats()
        },
        eventStore: {
          status: 'operational',
          recentEventsCount: recentEvents.length
        },
        statistics: {
          last24Hours: stats.statistics
        },
        cache: {
          size: this.cache.size
        }
      };
    } catch (error) {
      this.logger.error('Health check failed:', error);
      return {
        status: 'unhealthy',
        service: 'audit-service',
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }

  // Utility methods
  async clearCache() {
    this.cache.clear();
    this.logger.info('Audit service cache cleared');
  }

  async cleanupOldAuditData(retentionDays = 2555) {
    const olderThan = new Date();
    olderThan.setDate(olderThan.getDate() - retentionDays);

    await this.purgeAuditLogs({
      olderThan: olderThan.toISOString(),
      forceDelete: false,
      backupFirst: true,
      approvedBy: 'system',
      complianceApproval: 'automated_cleanup'
    });

    this.logger.info(`Cleaned up audit data older than ${retentionDays} days`);
  }

  // Risk assessment
  calculateRiskScore(event) {
    let riskScore = 0;

    // Base risk scores by action type
    const actionRisk = {
      'LOGIN': 10,
      'LOGOUT': 5,
      'CREATE': 20,
      'UPDATE': 15,
      'DELETE': 40,
      'EXPORT': 35,
      'IMPORT': 30,
      'APPROVE': 25,
      'REJECT': 20,
      'TRANSFER': 45,
      'PASSWORD_CHANGE': 30,
      'PERMISSION_CHANGE': 50,
      'ROLE_CHANGE': 60,
      'ACCOUNT_LOCK': 70,
      'ACCOUNT_UNLOCK': 40,
      'SESSION_START': 10,
      'SESSION_END': 5,
      'API_ACCESS': 15,
      'DATA_ACCESS': 35,
      'CONFIG_CHANGE': 55,
      'SECURITY_ALERT': 80
    };

    riskScore += actionRisk[event.action] || 20;

    // Additional risk factors
    if (event.details?.unusualLocation) riskScore += 20;
    if (event.details?.unusualTime) riskScore += 15;
    if (event.details?.failedAttempts > 3) riskScore += 25;
    if (event.details?.suspiciousPattern) riskScore += 30;
    if (event.resource === 'ADMIN_CONFIG') riskScore += 40;

    return Math.min(riskScore, 100);
  }

  // Compliance checking
  checkCompliance(event) {
    const flags = [];

    // GDPR compliance
    if (event.resource === 'PERSONAL_DATA' && event.action === 'EXPORT') {
      flags.push('GDPR_DATA_EXPORT');
    }

    // SOX compliance
    if (event.resource === 'FINANCIAL_RECORD' && event.action === 'DELETE') {
      flags.push('SOX_FINANCIAL_MODIFICATION');
    }

    // PCI-DSS compliance
    if (event.resource === 'PAYMENT_DATA' && event.action === 'ACCESS') {
      flags.push('PCI_DSS_DATA_ACCESS');
    }

    // HIPAA compliance
    if (event.resource === 'MEDICAL_DATA') {
      flags.push('HIPAA_DATA_ACCESS');
    }

    return flags;
  }
}