import { v4 as uuidv4 } from 'uuid';
import { SettlementCommandHandler } from './handlers/settlement-command-handler.js';
import { SettlementQueryHandler } from './handlers/settlement-query-handler.js';
import {
  CreateSettlementCommand,
  ProcessSettlementCommand,
  CompleteSettlementCommand,
  CancelSettlementCommand,
  UpdateSettlementScheduleCommand,
  ProcessBulkSettlementCommand,
  AdjustSettlementCommand,
  CreateSettlementHoldCommand,
  ReleaseSettlementHoldCommand
} from './commands/settlement-commands.js';
import {
  GetSettlementQuery,
  GetSettlementsQuery,
  GetMerchantSettlementsQuery,
  GetSettlementScheduleQuery,
  GetSettlementAnalyticsQuery,
  GetSettlementReconciliationQuery,
  GetSettlementHoldsQuery,
  GetSettlementAdjustmentsQuery,
  GetSettlementDisputesQuery,
  GetSettlementDashboardQuery,
  GetSettlementReportQuery,
  GetSettlementMetricsQuery
} from './queries/settlement-queries.js';

export class SettlementService {
  constructor(dependencies) {
    this.connectionPool = dependencies.connectionPool;
    this.dualWriter = dependencies.dualWriter;
    this.eventStore = dependencies.eventStore;
    this.kafkaService = dependencies.kafkaService;
    this.commandBus = dependencies.commandBus;
    this.queryBus = dependencies.queryBus;
    this.logger = dependencies.logger;

    // Initialize handlers
    this.commandHandler = new SettlementCommandHandler(dependencies);
    this.queryHandler = new SettlementQueryHandler(dependencies);

    // Register handlers with buses
    this.registerHandlers();
  }

  async initialize() {
    try {
      this.logger.info('Initializing Settlement Service...');

      // Register command handlers
      this.commandBus.registerHandler('CreateSettlementCommand', this.commandHandler);
      this.commandBus.registerHandler('ProcessSettlementCommand', this.commandHandler);
      this.commandBus.registerHandler('CompleteSettlementCommand', this.commandHandler);
      this.commandBus.registerHandler('CancelSettlementCommand', this.commandHandler);
      this.commandBus.registerHandler('UpdateSettlementScheduleCommand', this.commandHandler);
      this.commandBus.registerHandler('ProcessBulkSettlementCommand', this.commandHandler);
      this.commandBus.registerHandler('AdjustSettlementCommand', this.commandHandler);
      this.commandBus.registerHandler('CreateSettlementHoldCommand', this.commandHandler);
      this.commandBus.registerHandler('ReleaseSettlementHoldCommand', this.commandHandler);

      // Register query handlers
      this.queryBus.registerHandler('GetSettlementQuery', this.queryHandler);
      this.queryBus.registerHandler('GetSettlementsQuery', this.queryHandler);
      this.queryBus.registerHandler('GetMerchantSettlementsQuery', this.queryHandler);
      this.queryBus.registerHandler('GetSettlementScheduleQuery', this.queryHandler);
      this.queryBus.registerHandler('GetSettlementAnalyticsQuery', this.queryHandler);
      this.queryBus.registerHandler('GetSettlementReconciliationQuery', this.queryHandler);
      this.queryBus.registerHandler('GetSettlementHoldsQuery', this.queryHandler);
      this.queryBus.registerHandler('GetSettlementAdjustmentsQuery', this.queryHandler);
      this.queryBus.registerHandler('GetSettlementDisputesQuery', this.queryHandler);
      this.queryBus.registerHandler('GetSettlementDashboardQuery', this.queryHandler);
      this.queryBus.registerHandler('GetSettlementReportQuery', this.queryHandler);
      this.queryBus.registerHandler('GetSettlementMetricsQuery', this.queryHandler);

      this.logger.info('Settlement Service initialized successfully');
    } catch (error) {
      this.logger.error('Error initializing Settlement Service:', error);
      throw error;
    }
  }

  registerHandlers() {
    // Command handlers are registered in initialize()
    // This method can be used for additional setup if needed
  }

  getHealthStatus() {
    return {
      service: 'settlement-service',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      handlers: {
        commandHandler: 'registered',
        queryHandler: 'registered'
      },
      dependencies: {
        database: this.connectionPool.getStats ? this.connectionPool.getStats() : 'ok',
        kafka: this.kafkaService.getStats ? this.kafkaService.getStats() : 'ok',
        eventStore: this.eventStore.getStats ? this.eventStore.getStats() : 'ok'
      }
    };
  }

  // Public API methods that create commands and send them through the bus

  async createSettlement(data) {
    const command = new CreateSettlementCommand(data);
    return await this.commandBus.send(command);
  }

  async processSettlement(settlementId, data) {
    const command = new ProcessSettlementCommand({
      settlementId,
      ...data
    });
    return await this.commandBus.send(command);
  }

  async completeSettlement(settlementId, data) {
    const command = new CompleteSettlementCommand({
      settlementId,
      ...data
    });
    return await this.commandBus.send(command);
  }

  async cancelSettlement(settlementId, data) {
    const command = new CancelSettlementCommand({
      settlementId,
      ...data
    });
    return await this.commandBus.send(command);
  }

  async updateSettlementSchedule(data) {
    const command = new UpdateSettlementScheduleCommand(data);
    return await this.commandBus.send(command);
  }

  async processBulkSettlement(data) {
    const command = new ProcessBulkSettlementCommand(data);
    return await this.commandBus.send(command);
  }

  async adjustSettlement(settlementId, data) {
    const command = new AdjustSettlementCommand({
      settlementId,
      ...data
    });
    return await this.commandBus.send(command);
  }

  async createSettlementHold(settlementId, data) {
    const command = new CreateSettlementHoldCommand({
      settlementId,
      ...data
    });
    return await this.commandBus.send(command);
  }

  async releaseSettlementHold(settlementId, holdId, data) {
    const command = new ReleaseSettlementHoldCommand({
      settlementId,
      holdId,
      ...data
    });
    return await this.commandBus.send(command);
  }

  // Query methods

  async getSettlement(settlementId, includeDetails = true) {
    const query = new GetSettlementQuery(settlementId, includeDetails);
    return await this.queryBus.query(query);
  }

  async getSettlements(filters = {}, pagination = {}) {
    const query = new GetSettlementsQuery(filters, pagination);
    return await this.queryBus.query(query);
  }

  async getMerchantSettlements(merchantId, filters = {}, pagination = {}) {
    const query = new GetMerchantSettlementsQuery(merchantId, filters, pagination);
    return await this.queryBus.query(query);
  }

  async getSettlementSchedule(merchantId) {
    const query = new GetSettlementScheduleQuery(merchantId);
    return await this.queryBus.query(query);
  }

  async getSettlementAnalytics(analyticsType, filters = {}) {
    const query = new GetSettlementAnalyticsQuery(analyticsType, filters);
    return await this.queryBus.query(query);
  }

  async getSettlementReconciliation(filters = {}) {
    const query = new GetSettlementReconciliationQuery(filters);
    return await this.queryBus.query(query);
  }

  async getSettlementHolds(filters = {}, pagination = {}) {
    const query = new GetSettlementHoldsQuery(filters, pagination);
    return await this.queryBus.query(query);
  }

  async getSettlementAdjustments(settlementId, pagination = {}) {
    const query = new GetSettlementAdjustmentsQuery(settlementId, pagination);
    return await this.queryBus.query(query);
  }

  async getSettlementDisputes(filters = {}, pagination = {}) {
    const query = new GetSettlementDisputesQuery(filters, pagination);
    return await this.queryBus.query(query);
  }

  async getSettlementDashboard(filters = {}) {
    const query = new GetSettlementDashboardQuery(filters);
    return await this.queryBus.query(query);
  }

  async getSettlementReport(reportType, filters = {}) {
    const query = new GetSettlementReportQuery(reportType, filters);
    return await this.queryBus.query(query);
  }

  async getSettlementMetrics(metricType, filters = {}) {
    const query = new GetSettlementMetricsQuery(metricType, filters);
    return await this.queryBus.query(query);
  }

  // Business logic methods

  async calculateSettlementAmounts(merchantId, startDate, endDate, transactionIds = null) {
    try {
      let query = `
        SELECT
          id, amount, fee_amount, currency, status
        FROM transactions
        WHERE merchant_id = ? AND status = 'completed' AND settlement_id IS NULL
      `;
      let params = [merchantId];

      if (startDate && endDate) {
        query += ' AND created_at >= ? AND created_at <= ?';
        params.push(startDate, endDate);
      }

      if (transactionIds && transactionIds.length > 0) {
        const placeholders = transactionIds.map(() => '?').join(',');
        query += ` AND id IN (${placeholders})`;
        params.push(...transactionIds);
      }

      const transactions = await this.connectionPool.executeWithMySQLConnection(
        async (connection) => {
          const [rows] = await connection.execute(query, params);
          return rows;
        }
      );

      if (!transactions || transactions.length === 0) {
        return {
          totalAmount: 0,
          currency: 'USD',
          transactionCount: 0,
          feeAmount: 0,
          netAmount: 0,
          transactionIds: []
        };
      }

      const totalAmount = transactions.reduce((sum, t) => sum + parseFloat(t.amount), 0);
      const feeAmount = transactions.reduce((sum, t) => sum + parseFloat(t.fee_amount || 0), 0);
      const netAmount = totalAmount - feeAmount;
      const currency = transactions[0].currency || 'USD';

      return {
        totalAmount: parseFloat(totalAmount.toFixed(2)),
        feeAmount: parseFloat(feeAmount.toFixed(2)),
        netAmount: parseFloat(netAmount.toFixed(2)),
        currency,
        transactionCount: transactions.length,
        transactionIds: transactions.map(t => t.id)
      };
    } catch (error) {
      this.logger.error('Error calculating settlement amounts:', error);
      throw error;
    }
  }

  async checkSettlementEligibility(merchantId, period) {
    try {
      // Get settlement schedule
      const schedule = await this.getSettlementSchedule(merchantId);
      if (!schedule || !schedule.isActive) {
        return { eligible: false, reason: 'No active settlement schedule' };
      }

      // Calculate available amount
      const settlementData = await this.calculateSettlementAmounts(
        merchantId,
        period.startDate,
        period.endDate
      );

      if (settlementData.netAmount < schedule.minimumAmount) {
        return {
          eligible: false,
          reason: `Amount below minimum: ${settlementData.netAmount} < ${schedule.minimumAmount}`,
          availableAmount: settlementData.netAmount
        };
      }

      if (schedule.maximumAmount && settlementData.netAmount > schedule.maximumAmount) {
        return {
          eligible: false,
          reason: `Amount above maximum: ${settlementData.netAmount} > ${schedule.maximumAmount}`,
          availableAmount: settlementData.netAmount
        };
      }

      // Check for active holds
      const activeHolds = await this.getSettlementHolds({
        merchantId,
        status: 'active'
      });

      if (activeHolds.holds && activeHolds.holds.length > 0) {
        return {
          eligible: false,
          reason: 'Merchant has active settlement holds',
          activeHolds: activeHolds.holds.length
        };
      }

      return {
        eligible: true,
        amount: settlementData.netAmount,
        transactionCount: settlementData.transactionCount
      };
    } catch (error) {
      this.logger.error('Error checking settlement eligibility:', error);
      return { eligible: false, reason: 'Error checking eligibility' };
    }
  }

  async processScheduledSettlements() {
    try {
      this.logger.info('Processing scheduled settlements...');

      // Get all active settlement schedules
      const schedules = await this.connectionPool.executeWithMySQLConnection(
        async (connection) => {
          const [rows] = await connection.execute(
            'SELECT * FROM settlement_schedules WHERE is_active = true'
          );
          return rows;
        }
      );

      const results = [];

      for (const schedule of schedules) {
        try {
          // Check if it's time to process settlement for this merchant
          const shouldProcess = await this.shouldProcessSettlement(schedule);
          if (!shouldProcess) continue;

          // Calculate period based on schedule type
          const period = this.calculateSettlementPeriod(schedule);

          // Check eligibility
          const eligibility = await this.checkSettlementEligibility(schedule.merchant_id, period);
          if (!eligibility.eligible) {
            this.logger.info(`Merchant ${schedule.merchant_id} not eligible for settlement: ${eligibility.reason}`);
            continue;
          }

          // Create settlement
          const settlement = await this.createSettlement({
            merchantId: schedule.merchant_id,
            period,
            createdBy: 'system',
            metadata: { scheduled: true, scheduleId: schedule.id }
          });

          results.push({
            merchantId: schedule.merchant_id,
            settlementId: settlement.id,
            amount: settlement.netAmount,
            status: 'created'
          });

        } catch (error) {
          this.logger.error(`Error processing scheduled settlement for merchant ${schedule.merchant_id}:`, error);
          results.push({
            merchantId: schedule.merchant_id,
            error: error.message,
            status: 'failed'
          });
        }
      }

      this.logger.info(`Processed ${results.length} scheduled settlements`);
      return results;
    } catch (error) {
      this.logger.error('Error processing scheduled settlements:', error);
      throw error;
    }
  }

  async shouldProcessSettlement(schedule) {
    try {
      const now = new Date();
      const scheduleConfig = typeof schedule.schedule_config === 'string'
        ? JSON.parse(schedule.schedule_config)
        : schedule.schedule_config;

      switch (schedule.schedule_type) {
        case 'daily':
          // Process daily at cutoff time
          const cutoffTime = scheduleConfig.cutoffTime || '23:59:59';
          const [hours, minutes, seconds] = cutoffTime.split(':').map(Number);
          const cutoffDate = new Date(now);
          cutoffDate.setHours(hours, minutes, seconds, 0);

          return now >= cutoffDate;

        case 'weekly':
          // Process on specific day of week at cutoff time
          const targetDayOfWeek = scheduleConfig.dayOfWeek || 5; // Friday by default
          if (now.getDay() !== targetDayOfWeek) return false;

          const weeklyCutoff = scheduleConfig.cutoffTime || '23:59:59';
          const [wh, wm, ws] = weeklyCutoff.split(':').map(Number);
          const weeklyCutoffDate = new Date(now);
          weeklyCutoffDate.setHours(wh, wm, ws, 0);

          return now >= weeklyCutoffDate;

        case 'monthly':
          // Process on specific day of month at cutoff time
          const targetDayOfMonth = scheduleConfig.dayOfMonth || 1; // 1st of month by default
          if (now.getDate() !== targetDayOfMonth) return false;

          const monthlyCutoff = scheduleConfig.cutoffTime || '23:59:59';
          const [mh, mm, ms] = monthlyCutoff.split(':').map(Number);
          const monthlyCutoffDate = new Date(now);
          monthlyCutoffDate.setHours(mh, mm, ms, 0);

          return now >= monthlyCutoffDate;

        default:
          return false;
      }
    } catch (error) {
      this.logger.error('Error checking if settlement should be processed:', error);
      return false;
    }
  }

  calculateSettlementPeriod(schedule) {
    const now = new Date();
    const scheduleConfig = typeof schedule.schedule_config === 'string'
      ? JSON.parse(schedule.schedule_config)
      : schedule.schedule_config;

    let startDate, endDate;

    switch (schedule.schedule_type) {
      case 'daily':
        // Previous day
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 1);
        startDate.setHours(0, 0, 0, 0);

        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
        break;

      case 'weekly':
        // Previous week
        const currentDay = now.getDay();
        const targetDay = scheduleConfig.dayOfWeek || 5;
        const daysToSubtract = (currentDay - targetDay + 7) % 7 || 7;

        endDate = new Date(now);
        endDate.setDate(endDate.getDate() - daysToSubtract);
        endDate.setHours(23, 59, 59, 999);

        startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 6);
        startDate.setHours(0, 0, 0, 0);
        break;

      case 'monthly':
        // Previous month
        endDate = new Date(now.getFullYear(), now.getMonth(), 0); // Last day of previous month
        endDate.setHours(23, 59, 59, 999);

        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1); // First day of previous month
        startDate.setHours(0, 0, 0, 0);
        break;

      default:
        // Default to last 30 days
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 30);
        startDate.setHours(0, 0, 0, 0);

        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
    }

    return { startDate, endDate };
  }

  async generateSettlementReport(merchantId, period, format = 'json') {
    try {
      const settlements = await this.getMerchantSettlements(merchantId, {
        startDate: period.startDate,
        endDate: period.endDate
      });

      const summary = {
        merchantId,
        period,
        totalSettlements: settlements.settlements.length,
        totalAmount: settlements.settlements.reduce((sum, s) => sum + s.netAmount, 0),
        totalFees: settlements.settlements.reduce((sum, s) => sum + s.feeAmount, 0),
        settlementsByStatus: {}
      };

      // Group by status
      settlements.settlements.forEach(settlement => {
        if (!summary.settlementsByStatus[settlement.status]) {
          summary.settlementsByStatus[settlement.status] = { count: 0, amount: 0 };
        }
        summary.settlementsByStatus[settlement.status].count++;
        summary.settlementsByStatus[settlement.status].amount += settlement.netAmount;
      });

      const report = {
        generatedAt: new Date(),
        format,
        data: settlements.settlements,
        summary
      };

      return report;
    } catch (error) {
      this.logger.error('Error generating settlement report:', error);
      throw error;
    }
  }

  async reconcileSettlements(startDate, endDate, merchantId = null) {
    try {
      const reconciliation = await this.getSettlementReconciliation({
        startDate,
        endDate,
        merchantId,
        includeDiscrepancies: true
      });

      // Log reconciliation results
      if (reconciliation.reconciliation.discrepancy > 0.01) {
        this.logger.warn('Settlement reconciliation discrepancy found:', {
          merchantId,
          period: { startDate, endDate },
          discrepancy: reconciliation.reconciliation.discrepancy,
          discrepancies: reconciliation.discrepancies
        });
      } else {
        this.logger.info('Settlement reconciliation successful:', {
          merchantId,
          period: { startDate, endDate },
          settledAmount: reconciliation.reconciliation.settledAmount,
          transactionAmount: reconciliation.reconciliation.transactionAmount
        });
      }

      return reconciliation;
    } catch (error) {
      this.logger.error('Error reconciling settlements:', error);
      throw error;
    }
  }
}