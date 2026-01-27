import { v4 as uuidv4 } from 'uuid';
import {
  SettlementCreatedEvent,
  SettlementProcessedEvent,
  SettlementCompletedEvent,
  SettlementCancelledEvent,
  SettlementScheduleUpdatedEvent,
  BulkSettlementProcessedEvent,
  SettlementAdjustedEvent,
  SettlementHoldPlacedEvent,
  SettlementHoldReleasedEvent,
  SettlementFailedEvent,
  SettlementDisputedEvent
} from '../events/settlement-events.js';

export class SettlementCommandHandler {
  constructor(dependencies) {
    this.connectionPool = dependencies.connectionPool;
    this.dualWriter = dependencies.dualWriter;
    this.eventStore = dependencies.eventStore;
    this.kafkaService = dependencies.kafkaService;
    this.logger = dependencies.logger;
  }

  async handle(command) {
    try {
      command.validate();

      switch (command.constructor.name) {
        case 'CreateSettlementCommand':
          return await this.handleCreateSettlement(command);
        case 'ProcessSettlementCommand':
          return await this.handleProcessSettlement(command);
        case 'CompleteSettlementCommand':
          return await this.handleCompleteSettlement(command);
        case 'CancelSettlementCommand':
          return await this.handleCancelSettlement(command);
        case 'UpdateSettlementScheduleCommand':
          return await this.handleUpdateSettlementSchedule(command);
        case 'ProcessBulkSettlementCommand':
          return await this.handleProcessBulkSettlement(command);
        case 'AdjustSettlementCommand':
          return await this.handleAdjustSettlement(command);
        case 'CreateSettlementHoldCommand':
          return await this.handleCreateSettlementHold(command);
        case 'ReleaseSettlementHoldCommand':
          return await this.handleReleaseSettlementHold(command);
        default:
          throw new Error(`Unknown command type: ${command.constructor.name}`);
      }
    } catch (error) {
      this.logger.error('Error handling settlement command:', error);
      throw error;
    }
  }

  async handleCreateSettlement(command) {
    try {
      // Calculate settlement details
      const settlementData = await this.calculateSettlementDetails(
        command.merchantId,
        command.period,
        command.transactionIds
      );

      const settlement = {
        id: command.id,
        merchantId: command.merchantId,
        amount: settlementData.totalAmount,
        currency: command.currency,
        period: command.period,
        transactionIds: settlementData.transactionIds,
        transactionCount: settlementData.transactionCount,
        feeAmount: settlementData.feeAmount,
        netAmount: settlementData.netAmount,
        settlementMethod: command.settlementMethod,
        status: 'pending',
        metadata: command.metadata,
        createdBy: command.createdBy,
        createdAt: command.createdAt,
        processedAt: null,
        completedAt: null,
        updatedAt: command.createdAt
      };

      // Save to databases
      await this.dualWriter.writeToAllDatabases(settlement);

      // Create and store event
      const event = new SettlementCreatedEvent({
        eventId: uuidv4(),
        settlementId: settlement.id,
        merchantId: settlement.merchantId,
        amount: settlement.amount,
        currency: settlement.currency,
        period: settlement.period,
        transactionIds: settlement.transactionIds,
        feeAmount: settlement.feeAmount,
        netAmount: settlement.netAmount,
        settlementMethod: settlement.settlementMethod,
        metadata: settlement.metadata,
        createdBy: settlement.createdBy
      });

      await this.eventStore.saveEvent(event);
      await this.kafkaService.produce('settlement-events', event);

      // Mark transactions as settled
      await this.markTransactionsAsSettled(settlement.transactionIds, settlement.id);

      this.logger.info(`Settlement created: ${settlement.id}`);
      return settlement;
    } catch (error) {
      this.logger.error('Error creating settlement:', error);
      throw error;
    }
  }

  async handleProcessSettlement(command) {
    try {
      // Get current settlement
      const settlement = await this.getSettlementById(command.settlementId);
      if (!settlement) {
        throw new Error('Settlement not found');
      }

      if (settlement.status !== 'pending') {
        throw new Error(`Settlement is already ${settlement.status}`);
      }

      // Check for holds
      const activeHolds = await this.getActiveSettlementHolds(command.settlementId);
      if (activeHolds.length > 0) {
        throw new Error('Settlement has active holds and cannot be processed');
      }

      // Update settlement status
      const updatedSettlement = {
        ...settlement,
        status: 'processing',
        processedBy: command.processedBy,
        processingNotes: command.processingNotes,
        processedAt: command.processedAt,
        metadata: { ...settlement.metadata, ...command.metadata },
        updatedAt: command.processedAt
      };

      await this.updateSettlement(updatedSettlement);

      // Create and store event
      const event = new SettlementProcessedEvent({
        eventId: uuidv4(),
        settlementId: command.settlementId,
        processedBy: command.processedBy,
        processingNotes: command.processingNotes,
        metadata: command.metadata
      });

      await this.eventStore.saveEvent(event);
      await this.kafkaService.produce('settlement-events', event);

      this.logger.info(`Settlement processed: ${command.settlementId}`);
      return updatedSettlement;
    } catch (error) {
      this.logger.error('Error processing settlement:', error);
      throw error;
    }
  }

  async handleCompleteSettlement(command) {
    try {
      const settlement = await this.getSettlementById(command.settlementId);
      if (!settlement) {
        throw new Error('Settlement not found');
      }

      if (!['processing', 'pending'].includes(settlement.status)) {
        throw new Error(`Settlement cannot be completed from status: ${settlement.status}`);
      }

      const updatedSettlement = {
        ...settlement,
        status: 'completed',
        referenceNumber: command.referenceNumber,
        transferDetails: command.transferDetails,
        completedBy: command.completedBy,
        completionNotes: command.completionNotes,
        completedAt: command.completedAt,
        metadata: { ...settlement.metadata, ...command.metadata },
        updatedAt: command.completedAt
      };

      await this.updateSettlement(updatedSettlement);

      // Create and store event
      const event = new SettlementCompletedEvent({
        eventId: uuidv4(),
        settlementId: command.settlementId,
        referenceNumber: command.referenceNumber,
        transferDetails: command.transferDetails,
        completedBy: command.completedBy,
        completionNotes: command.completionNotes,
        metadata: command.metadata
      });

      await this.eventStore.saveEvent(event);
      await this.kafkaService.produce('settlement-events', event);

      this.logger.info(`Settlement completed: ${command.settlementId}`);
      return updatedSettlement;
    } catch (error) {
      this.logger.error('Error completing settlement:', error);
      throw error;
    }
  }

  async handleCancelSettlement(command) {
    try {
      const settlement = await this.getSettlementById(command.settlementId);
      if (!settlement) {
        throw new Error('Settlement not found');
      }

      if (['completed', 'cancelled'].includes(settlement.status)) {
        throw new Error(`Settlement is already ${settlement.status}`);
      }

      const updatedSettlement = {
        ...settlement,
        status: 'cancelled',
        cancelledBy: command.cancelledBy,
        cancellationReason: command.reason,
        cancellationNotes: command.cancellationNotes,
        cancelledAt: command.cancelledAt,
        metadata: { ...settlement.metadata, ...command.metadata },
        updatedAt: command.cancelledAt
      };

      await this.updateSettlement(updatedSettlement);

      // Unmark transactions as settled
      await this.unmarkTransactionsAsSettled(settlement.transactionIds);

      // Create and store event
      const event = new SettlementCancelledEvent({
        eventId: uuidv4(),
        settlementId: command.settlementId,
        reason: command.reason,
        cancelledBy: command.cancelledBy,
        cancellationNotes: command.cancellationNotes,
        metadata: command.metadata
      });

      await this.eventStore.saveEvent(event);
      await this.kafkaService.produce('settlement-events', event);

      this.logger.info(`Settlement cancelled: ${command.settlementId}`);
      return updatedSettlement;
    } catch (error) {
      this.logger.error('Error cancelling settlement:', error);
      throw error;
    }
  }

  async handleUpdateSettlementSchedule(command) {
    try {
      const schedule = {
        merchantId: command.merchantId,
        scheduleType: command.scheduleType,
        scheduleConfig: command.scheduleConfig,
        minimumAmount: command.minimumAmount,
        maximumAmount: command.maximumAmount,
        isActive: command.isActive,
        updatedBy: command.updatedBy,
        updatedAt: command.updatedAt
      };

      // Save schedule to database
      await this.saveSettlementSchedule(schedule);

      // Create and store event
      const event = new SettlementScheduleUpdatedEvent({
        eventId: uuidv4(),
        merchantId: command.merchantId,
        scheduleType: command.scheduleType,
        scheduleConfig: command.scheduleConfig,
        minimumAmount: command.minimumAmount,
        maximumAmount: command.maximumAmount,
        isActive: command.isActive,
        updatedBy: command.updatedBy
      });

      await this.eventStore.saveEvent(event);
      await this.kafkaService.produce('settlement-events', event);

      this.logger.info(`Settlement schedule updated for merchant: ${command.merchantId}`);
      return schedule;
    } catch (error) {
      this.logger.error('Error updating settlement schedule:', error);
      throw error;
    }
  }

  async handleProcessBulkSettlement(command) {
    try {
      const settlements = [];
      const settlementIds = [];

      for (const merchantId of command.merchantIds) {
        try {
          // Check if merchant meets settlement criteria
          const canSettle = await this.checkSettlementEligibility(merchantId, command.period);
          if (!canSettle.eligible && !command.forceProcess) {
            continue;
          }

          // Create settlement for merchant
          const createCommand = {
            id: uuidv4(),
            merchantId,
            period: command.period,
            createdBy: command.processedBy,
            createdAt: command.createdAt,
            validate: () => true
          };

          const settlement = await this.handleCreateSettlement(createCommand);
          settlements.push(settlement);
          settlementIds.push(settlement.id);

        } catch (error) {
          this.logger.warn(`Failed to process settlement for merchant ${merchantId}:`, error);
        }
      }

      const totalAmount = settlements.reduce((sum, s) => sum + s.netAmount, 0);

      // Create and store event
      const event = new BulkSettlementProcessedEvent({
        eventId: uuidv4(),
        settlementIds,
        merchantIds: command.merchantIds,
        period: command.period,
        totalAmount,
        processedBy: command.processedBy,
        metadata: command.metadata
      });

      await this.eventStore.saveEvent(event);
      await this.kafkaService.produce('settlement-events', event);

      this.logger.info(`Bulk settlement processed: ${settlements.length} settlements created`);
      return { settlements, totalAmount, count: settlements.length };
    } catch (error) {
      this.logger.error('Error processing bulk settlement:', error);
      throw error;
    }
  }

  async handleAdjustSettlement(command) {
    try {
      const settlement = await this.getSettlementById(command.settlementId);
      if (!settlement) {
        throw new Error('Settlement not found');
      }

      // Calculate new amounts
      const adjustment = {
        id: uuidv4(),
        settlementId: command.settlementId,
        adjustmentType: command.adjustmentType,
        adjustmentAmount: command.adjustmentAmount,
        reason: command.reason,
        referenceId: command.referenceId,
        adjustedBy: command.adjustedBy,
        adjustedAt: command.adjustedAt,
        metadata: command.metadata
      };

      // Save adjustment
      await this.saveSettlementAdjustment(adjustment);

      // Update settlement amounts
      const updatedSettlement = {
        ...settlement,
        netAmount: settlement.netAmount + command.adjustmentAmount,
        adjustments: [...(settlement.adjustments || []), adjustment],
        updatedAt: command.adjustedAt
      };

      await this.updateSettlement(updatedSettlement);

      // Create and store event
      const event = new SettlementAdjustedEvent({
        eventId: uuidv4(),
        settlementId: command.settlementId,
        adjustmentType: command.adjustmentType,
        adjustmentAmount: command.adjustmentAmount,
        reason: command.reason,
        referenceId: command.referenceId,
        adjustedBy: command.adjustedBy,
        metadata: command.metadata
      });

      await this.eventStore.saveEvent(event);
      await this.kafkaService.produce('settlement-events', event);

      this.logger.info(`Settlement adjusted: ${command.settlementId}, amount: ${command.adjustmentAmount}`);
      return { settlement: updatedSettlement, adjustment };
    } catch (error) {
      this.logger.error('Error adjusting settlement:', error);
      throw error;
    }
  }

  async handleCreateSettlementHold(command) {
    try {
      const hold = {
        id: uuidv4(),
        settlementId: command.settlementId,
        holdType: command.holdType,
        holdReason: command.holdReason,
        holdAmount: command.holdAmount,
        releaseDate: command.releaseDate,
        placedBy: command.placedBy,
        status: 'active',
        placedAt: command.placedAt,
        metadata: command.metadata
      };

      // Save hold to database
      await this.saveSettlementHold(hold);

      // Update settlement status if needed
      const settlement = await this.getSettlementById(command.settlementId);
      if (settlement && settlement.status === 'pending') {
        await this.updateSettlement({
          ...settlement,
          status: 'on_hold',
          updatedAt: command.placedAt
        });
      }

      // Create and store event
      const event = new SettlementHoldPlacedEvent({
        eventId: uuidv4(),
        settlementId: command.settlementId,
        holdId: hold.id,
        holdType: command.holdType,
        holdReason: command.holdReason,
        holdAmount: command.holdAmount,
        releaseDate: command.releaseDate,
        placedBy: command.placedBy,
        metadata: command.metadata
      });

      await this.eventStore.saveEvent(event);
      await this.kafkaService.produce('settlement-events', event);

      this.logger.info(`Settlement hold placed: ${command.settlementId}, hold: ${hold.id}`);
      return hold;
    } catch (error) {
      this.logger.error('Error creating settlement hold:', error);
      throw error;
    }
  }

  async handleReleaseSettlementHold(command) {
    try {
      // Update hold status
      await this.releaseSettlementHold(command.holdId, command);

      // Check if settlement can be released from hold
      const activeHolds = await this.getActiveSettlementHolds(command.settlementId);
      if (activeHolds.length === 0) {
        const settlement = await this.getSettlementById(command.settlementId);
        if (settlement && settlement.status === 'on_hold') {
          await this.updateSettlement({
            ...settlement,
            status: 'pending',
            updatedAt: command.releasedAt
          });
        }
      }

      // Create and store event
      const event = new SettlementHoldReleasedEvent({
        eventId: uuidv4(),
        settlementId: command.settlementId,
        holdId: command.holdId,
        releaseReason: command.releaseReason,
        releasedBy: command.releasedBy,
        metadata: command.metadata
      });

      await this.eventStore.saveEvent(event);
      await this.kafkaService.produce('settlement-events', event);

      this.logger.info(`Settlement hold released: ${command.settlementId}, hold: ${command.holdId}`);
      return { success: true };
    } catch (error) {
      this.logger.error('Error releasing settlement hold:', error);
      throw error;
    }
  }

  // Helper methods
  async calculateSettlementDetails(merchantId, period, transactionIds = null) {
    try {
      let query = `
        SELECT id, amount, fee_amount, currency
        FROM transactions
        WHERE merchant_id = ? AND status = 'completed' AND settlement_id IS NULL
      `;
      let params = [merchantId];

      if (period && period.startDate && period.endDate) {
        query += ' AND created_at >= ? AND created_at <= ?';
        params.push(period.startDate, period.endDate);
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

      const totalAmount = transactions.reduce((sum, t) => sum + parseFloat(t.amount), 0);
      const feeAmount = transactions.reduce((sum, t) => sum + parseFloat(t.fee_amount || 0), 0);
      const netAmount = totalAmount - feeAmount;
      const currency = transactions.length > 0 ? transactions[0].currency : 'USD';

      return {
        totalAmount: parseFloat(totalAmount.toFixed(2)),
        feeAmount: parseFloat(feeAmount.toFixed(2)),
        netAmount: parseFloat(netAmount.toFixed(2)),
        currency,
        transactionCount: transactions.length,
        transactionIds: transactions.map(t => t.id)
      };
    } catch (error) {
      this.logger.error('Error calculating settlement details:', error);
      throw error;
    }
  }

  async getSettlementById(settlementId) {
    try {
      const mysqlResult = await this.connectionPool.executeWithMySQLConnection(
        async (connection) => {
          const [rows] = await connection.execute(
            'SELECT * FROM settlements WHERE id = ?',
            [settlementId]
          );
          return rows[0];
        }
      );

      if (mysqlResult) return mysqlResult;

      const mongoDB = this.connectionPool.getMongoDatabase();
      return await mongoDB.collection('settlements').findOne({ id: settlementId });
    } catch (error) {
      this.logger.error('Error getting settlement by ID:', error);
      throw error;
    }
  }

  async updateSettlement(settlement) {
    try {
      await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        await connection.execute(
          `UPDATE settlements SET
            status = ?, processed_at = ?, completed_at = ?, cancelled_at = ?,
            processed_by = ?, completed_by = ?, cancelled_by = ?,
            cancellation_reason = ?, cancellation_notes = ?,
            reference_number = ?, transfer_details = ?, processing_notes = ?,
            completion_notes = ?, metadata = ?, updated_at = NOW()
           WHERE id = ?`,
          [
            settlement.status,
            settlement.processedAt,
            settlement.completedAt,
            settlement.cancelledAt,
            settlement.processedBy,
            settlement.completedBy,
            settlement.cancelledBy,
            settlement.cancellationReason,
            settlement.cancellationNotes,
            settlement.referenceNumber,
            JSON.stringify(settlement.transferDetails || {}),
            settlement.processingNotes,
            settlement.completionNotes,
            JSON.stringify(settlement.metadata || {}),
            settlement.id
          ]
        );
      });

      const mongoDB = this.connectionPool.getMongoDatabase();
      await mongoDB.collection('settlements').updateOne(
        { id: settlement.id },
        { $set: settlement }
      );
    } catch (error) {
      this.logger.error('Error updating settlement:', error);
      throw error;
    }
  }

  async markTransactionsAsSettled(transactionIds, settlementId) {
    try {
      if (transactionIds.length === 0) return;

      await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const placeholders = transactionIds.map(() => '?').join(',');
        await connection.execute(
          `UPDATE transactions SET settlement_id = ?, updated_at = NOW()
           WHERE id IN (${placeholders})`,
          [settlementId, ...transactionIds]
        );
      });

      const mongoDB = this.connectionPool.getMongoDatabase();
      await mongoDB.collection('transactions').updateMany(
        { id: { $in: transactionIds } },
        { $set: { settlementId, updatedAt: new Date() } }
      );
    } catch (error) {
      this.logger.error('Error marking transactions as settled:', error);
      throw error;
    }
  }

  async unmarkTransactionsAsSettled(transactionIds) {
    try {
      if (transactionIds.length === 0) return;

      await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const placeholders = transactionIds.map(() => '?').join(',');
        await connection.execute(
          `UPDATE transactions SET settlement_id = NULL, updated_at = NOW()
           WHERE id IN (${placeholders})`,
          transactionIds
        );
      });

      const mongoDB = this.connectionPool.getMongoDatabase();
      await mongoDB.collection('transactions').updateMany(
        { id: { $in: transactionIds } },
        { $unset: { settlementId: 1 }, $set: { updatedAt: new Date() } }
      );
    } catch (error) {
      this.logger.error('Error unmarking transactions as settled:', error);
      throw error;
    }
  }

  async getActiveSettlementHolds(settlementId) {
    try {
      const mysqlResult = await this.connectionPool.executeWithMySQLConnection(
        async (connection) => {
          const [rows] = await connection.execute(
            'SELECT * FROM settlement_holds WHERE settlement_id = ? AND status = "active"',
            [settlementId]
          );
          return rows;
        }
      );

      return mysqlResult || [];
    } catch (error) {
      this.logger.error('Error getting active settlement holds:', error);
      return [];
    }
  }

  async saveSettlementSchedule(schedule) {
    try {
      await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        await connection.execute(
          `INSERT INTO settlement_schedules
           (merchant_id, schedule_type, schedule_config, minimum_amount, maximum_amount, is_active, updated_by, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
           schedule_type = VALUES(schedule_type),
           schedule_config = VALUES(schedule_config),
           minimum_amount = VALUES(minimum_amount),
           maximum_amount = VALUES(maximum_amount),
           is_active = VALUES(is_active),
           updated_by = VALUES(updated_by),
           updated_at = VALUES(updated_at)`,
          [
            schedule.merchantId,
            schedule.scheduleType,
            JSON.stringify(schedule.scheduleConfig),
            schedule.minimumAmount,
            schedule.maximumAmount,
            schedule.isActive,
            schedule.updatedBy,
            schedule.updatedAt
          ]
        );
      });
    } catch (error) {
      this.logger.error('Error saving settlement schedule:', error);
      throw error;
    }
  }

  async checkSettlementEligibility(merchantId, period) {
    try {
      const schedule = await this.getSettlementSchedule(merchantId);
      if (!schedule || !schedule.isActive) {
        return { eligible: false, reason: 'No active settlement schedule' };
      }

      const settlementData = await this.calculateSettlementDetails(merchantId, period);

      if (settlementData.netAmount < schedule.minimumAmount) {
        return { eligible: false, reason: `Amount below minimum: ${settlementData.netAmount} < ${schedule.minimumAmount}` };
      }

      if (schedule.maximumAmount && settlementData.netAmount > schedule.maximumAmount) {
        return { eligible: false, reason: `Amount above maximum: ${settlementData.netAmount} > ${schedule.maximumAmount}` };
      }

      return { eligible: true, amount: settlementData.netAmount };
    } catch (error) {
      this.logger.error('Error checking settlement eligibility:', error);
      return { eligible: false, reason: 'Error checking eligibility' };
    }
  }

  async getSettlementSchedule(merchantId) {
    try {
      const mysqlResult = await this.connectionPool.executeWithMySQLConnection(
        async (connection) => {
          const [rows] = await connection.execute(
            'SELECT * FROM settlement_schedules WHERE merchant_id = ?',
            [merchantId]
          );
          return rows[0];
        }
      );

      return mysqlResult;
    } catch (error) {
      this.logger.error('Error getting settlement schedule:', error);
      return null;
    }
  }

  async saveSettlementAdjustment(adjustment) {
    try {
      await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        await connection.execute(
          `INSERT INTO settlement_adjustments
           (id, settlement_id, adjustment_type, adjustment_amount, reason, reference_id, adjusted_by, metadata, adjusted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            adjustment.id,
            adjustment.settlementId,
            adjustment.adjustmentType,
            adjustment.adjustmentAmount,
            adjustment.reason,
            adjustment.referenceId,
            adjustment.adjustedBy,
            JSON.stringify(adjustment.metadata || {}),
            adjustment.adjustedAt
          ]
        );
      });
    } catch (error) {
      this.logger.error('Error saving settlement adjustment:', error);
      throw error;
    }
  }

  async saveSettlementHold(hold) {
    try {
      await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        await connection.execute(
          `INSERT INTO settlement_holds
           (id, settlement_id, hold_type, hold_reason, hold_amount, release_date, placed_by, status, metadata, placed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            hold.id,
            hold.settlementId,
            hold.holdType,
            hold.holdReason,
            hold.holdAmount,
            hold.releaseDate,
            hold.placedBy,
            hold.status,
            JSON.stringify(hold.metadata || {}),
            hold.placedAt
          ]
        );
      });
    } catch (error) {
      this.logger.error('Error saving settlement hold:', error);
      throw error;
    }
  }

  async releaseSettlementHold(holdId, command) {
    try {
      await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        await connection.execute(
          `UPDATE settlement_holds SET
           status = 'released', released_by = ?, release_reason = ?, released_at = ?, updated_at = NOW()
           WHERE id = ?`,
          [command.releasedBy, command.releaseReason, command.releasedAt, holdId]
        );
      });
    } catch (error) {
      this.logger.error('Error releasing settlement hold:', error);
      throw error;
    }
  }
}