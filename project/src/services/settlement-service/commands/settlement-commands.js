import { v4 as uuidv4 } from 'uuid';

export class CreateSettlementCommand {
  constructor(data) {
    this.id = uuidv4();
    this.merchantId = data.merchantId;
    this.amount = data.amount;
    this.currency = data.currency || 'USD';
    this.period = data.period;
    this.transactionIds = data.transactionIds || [];
    this.feeAmount = data.feeAmount || 0;
    this.netAmount = data.netAmount || data.amount;
    this.settlementMethod = data.settlementMethod || 'bank_transfer';
    this.metadata = data.metadata || {};
    this.createdBy = data.createdBy;
    this.createdAt = new Date();
  }

  validate() {
    if (!this.merchantId) throw new Error('Merchant ID is required');
    if (!this.amount || this.amount <= 0) throw new Error('Valid amount is required');
    if (!this.period || !this.period.startDate || !this.period.endDate) {
      throw new Error('Settlement period is required');
    }
    return true;
  }
}

export class ProcessSettlementCommand {
  constructor(data) {
    this.settlementId = data.settlementId;
    this.processedBy = data.processedBy;
    this.processingNotes = data.processingNotes;
    this.metadata = data.metadata || {};
    this.processedAt = new Date();
  }

  validate() {
    if (!this.settlementId) throw new Error('Settlement ID is required');
    if (!this.processedBy) throw new Error('Processor ID is required');
    return true;
  }
}

export class CompleteSettlementCommand {
  constructor(data) {
    this.settlementId = data.settlementId;
    this.referenceNumber = data.referenceNumber;
    this.transferDetails = data.transferDetails;
    this.completedBy = data.completedBy;
    this.completionNotes = data.completionNotes;
    this.metadata = data.metadata || {};
    this.completedAt = new Date();
  }

  validate() {
    if (!this.settlementId) throw new Error('Settlement ID is required');
    if (!this.referenceNumber) throw new Error('Reference number is required');
    if (!this.completedBy) throw new Error('Completer ID is required');
    return true;
  }
}

export class CancelSettlementCommand {
  constructor(data) {
    this.settlementId = data.settlementId;
    this.reason = data.reason;
    this.cancelledBy = data.cancelledBy;
    this.cancellationNotes = data.cancellationNotes;
    this.metadata = data.metadata || {};
    this.cancelledAt = new Date();
  }

  validate() {
    if (!this.settlementId) throw new Error('Settlement ID is required');
    if (!this.reason) throw new Error('Cancellation reason is required');
    if (!this.cancelledBy) throw new Error('Canceller ID is required');
    return true;
  }
}

export class UpdateSettlementScheduleCommand {
  constructor(data) {
    this.merchantId = data.merchantId;
    this.scheduleType = data.scheduleType; // 'daily', 'weekly', 'monthly'
    this.scheduleConfig = data.scheduleConfig; // { dayOfWeek, dayOfMonth, cutoffTime }
    this.minimumAmount = data.minimumAmount || 0;
    this.maximumAmount = data.maximumAmount;
    this.isActive = data.isActive !== undefined ? data.isActive : true;
    this.updatedBy = data.updatedBy;
    this.updatedAt = new Date();
  }

  validate() {
    if (!this.merchantId) throw new Error('Merchant ID is required');
    if (!['daily', 'weekly', 'monthly'].includes(this.scheduleType)) {
      throw new Error('Invalid schedule type');
    }
    return true;
  }
}

export class ProcessBulkSettlementCommand {
  constructor(data) {
    this.merchantIds = data.merchantIds || [];
    this.period = data.period;
    this.forceProcess = data.forceProcess || false;
    this.processedBy = data.processedBy;
    this.metadata = data.metadata || {};
    this.createdAt = new Date();
  }

  validate() {
    if (!this.merchantIds || this.merchantIds.length === 0) {
      throw new Error('At least one merchant ID is required');
    }
    if (!this.period || !this.period.startDate || !this.period.endDate) {
      throw new Error('Settlement period is required');
    }
    if (!this.processedBy) throw new Error('Processor ID is required');
    return true;
  }
}

export class AdjustSettlementCommand {
  constructor(data) {
    this.settlementId = data.settlementId;
    this.adjustmentType = data.adjustmentType; // 'fee_adjustment', 'chargeback', 'refund'
    this.adjustmentAmount = data.adjustmentAmount;
    this.reason = data.reason;
    this.referenceId = data.referenceId; // transaction or chargeback ID
    this.adjustedBy = data.adjustedBy;
    this.metadata = data.metadata || {};
    this.adjustedAt = new Date();
  }

  validate() {
    if (!this.settlementId) throw new Error('Settlement ID is required');
    if (!['fee_adjustment', 'chargeback', 'refund'].includes(this.adjustmentType)) {
      throw new Error('Invalid adjustment type');
    }
    if (!this.adjustmentAmount || this.adjustmentAmount === 0) {
      throw new Error('Adjustment amount is required');
    }
    if (!this.reason) throw new Error('Adjustment reason is required');
    if (!this.adjustedBy) throw new Error('Adjuster ID is required');
    return true;
  }
}

export class CreateSettlementHoldCommand {
  constructor(data) {
    this.settlementId = data.settlementId;
    this.holdType = data.holdType; // 'risk_hold', 'compliance_hold', 'manual_hold'
    this.holdReason = data.holdReason;
    this.holdAmount = data.holdAmount;
    this.releaseDate = data.releaseDate;
    this.placedBy = data.placedBy;
    this.metadata = data.metadata || {};
    this.placedAt = new Date();
  }

  validate() {
    if (!this.settlementId) throw new Error('Settlement ID is required');
    if (!['risk_hold', 'compliance_hold', 'manual_hold'].includes(this.holdType)) {
      throw new Error('Invalid hold type');
    }
    if (!this.holdReason) throw new Error('Hold reason is required');
    if (!this.placedBy) throw new Error('Hold placer ID is required');
    return true;
  }
}

export class ReleaseSettlementHoldCommand {
  constructor(data) {
    this.settlementId = data.settlementId;
    this.holdId = data.holdId;
    this.releaseReason = data.releaseReason;
    this.releasedBy = data.releasedBy;
    this.metadata = data.metadata || {};
    this.releasedAt = new Date();
  }

  validate() {
    if (!this.settlementId) throw new Error('Settlement ID is required');
    if (!this.holdId) throw new Error('Hold ID is required');
    if (!this.releaseReason) throw new Error('Release reason is required');
    if (!this.releasedBy) throw new Error('Releaser ID is required');
    return true;
  }
}