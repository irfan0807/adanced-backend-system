export class SettlementCreatedEvent {
  constructor(data) {
    this.eventId = data.eventId;
    this.eventType = 'SETTLEMENT_CREATED';
    this.settlementId = data.settlementId;
    this.merchantId = data.merchantId;
    this.amount = data.amount;
    this.currency = data.currency;
    this.period = data.period;
    this.transactionIds = data.transactionIds || [];
    this.feeAmount = data.feeAmount;
    this.netAmount = data.netAmount;
    this.settlementMethod = data.settlementMethod;
    this.metadata = data.metadata || {};
    this.createdBy = data.createdBy;
    this.timestamp = new Date();
    this.version = 1;
  }
}

export class SettlementProcessedEvent {
  constructor(data) {
    this.eventId = data.eventId;
    this.eventType = 'SETTLEMENT_PROCESSED';
    this.settlementId = data.settlementId;
    this.processedBy = data.processedBy;
    this.processingNotes = data.processingNotes;
    this.metadata = data.metadata || {};
    this.timestamp = new Date();
    this.version = 1;
  }
}

export class SettlementCompletedEvent {
  constructor(data) {
    this.eventId = data.eventId;
    this.eventType = 'SETTLEMENT_COMPLETED';
    this.settlementId = data.settlementId;
    this.referenceNumber = data.referenceNumber;
    this.transferDetails = data.transferDetails;
    this.completedBy = data.completedBy;
    this.completionNotes = data.completionNotes;
    this.metadata = data.metadata || {};
    this.timestamp = new Date();
    this.version = 1;
  }
}

export class SettlementCancelledEvent {
  constructor(data) {
    this.eventId = data.eventId;
    this.eventType = 'SETTLEMENT_CANCELLED';
    this.settlementId = data.settlementId;
    this.reason = data.reason;
    this.cancelledBy = data.cancelledBy;
    this.cancellationNotes = data.cancellationNotes;
    this.metadata = data.metadata || {};
    this.timestamp = new Date();
    this.version = 1;
  }
}

export class SettlementScheduleUpdatedEvent {
  constructor(data) {
    this.eventId = data.eventId;
    this.eventType = 'SETTLEMENT_SCHEDULE_UPDATED';
    this.merchantId = data.merchantId;
    this.scheduleType = data.scheduleType;
    this.scheduleConfig = data.scheduleConfig;
    this.minimumAmount = data.minimumAmount;
    this.maximumAmount = data.maximumAmount;
    this.isActive = data.isActive;
    this.updatedBy = data.updatedBy;
    this.timestamp = new Date();
    this.version = 1;
  }
}

export class BulkSettlementProcessedEvent {
  constructor(data) {
    this.eventId = data.eventId;
    this.eventType = 'BULK_SETTLEMENT_PROCESSED';
    this.settlementIds = data.settlementIds || [];
    this.merchantIds = data.merchantIds || [];
    this.period = data.period;
    this.totalAmount = data.totalAmount;
    this.processedBy = data.processedBy;
    this.metadata = data.metadata || {};
    this.timestamp = new Date();
    this.version = 1;
  }
}

export class SettlementAdjustedEvent {
  constructor(data) {
    this.eventId = data.eventId;
    this.eventType = 'SETTLEMENT_ADJUSTED';
    this.settlementId = data.settlementId;
    this.adjustmentType = data.adjustmentType;
    this.adjustmentAmount = data.adjustmentAmount;
    this.reason = data.reason;
    this.referenceId = data.referenceId;
    this.adjustedBy = data.adjustedBy;
    this.metadata = data.metadata || {};
    this.timestamp = new Date();
    this.version = 1;
  }
}

export class SettlementHoldPlacedEvent {
  constructor(data) {
    this.eventId = data.eventId;
    this.eventType = 'SETTLEMENT_HOLD_PLACED';
    this.settlementId = data.settlementId;
    this.holdId = data.holdId;
    this.holdType = data.holdType;
    this.holdReason = data.holdReason;
    this.holdAmount = data.holdAmount;
    this.releaseDate = data.releaseDate;
    this.placedBy = data.placedBy;
    this.metadata = data.metadata || {};
    this.timestamp = new Date();
    this.version = 1;
  }
}

export class SettlementHoldReleasedEvent {
  constructor(data) {
    this.eventId = data.eventId;
    this.eventType = 'SETTLEMENT_HOLD_RELEASED';
    this.settlementId = data.settlementId;
    this.holdId = data.holdId;
    this.releaseReason = data.releaseReason;
    this.releasedBy = data.releasedBy;
    this.metadata = data.metadata || {};
    this.timestamp = new Date();
    this.version = 1;
  }
}

export class SettlementReconciledEvent {
  constructor(data) {
    this.eventId = data.eventId;
    this.eventType = 'SETTLEMENT_RECONCILED';
    this.settlementId = data.settlementId;
    this.reconciledAmount = data.reconciledAmount;
    this.discrepancies = data.discrepancies || [];
    this.reconciledBy = data.reconciledBy;
    this.metadata = data.metadata || {};
    this.timestamp = new Date();
    this.version = 1;
  }
}

export class SettlementFailedEvent {
  constructor(data) {
    this.eventId = data.eventId;
    this.eventType = 'SETTLEMENT_FAILED';
    this.settlementId = data.settlementId;
    this.failureReason = data.failureReason;
    this.failureDetails = data.failureDetails;
    this.failedBy = data.failedBy;
    this.metadata = data.metadata || {};
    this.timestamp = new Date();
    this.version = 1;
  }
}

export class SettlementDisputedEvent {
  constructor(data) {
    this.eventId = data.eventId;
    this.eventType = 'SETTLEMENT_DISPUTED';
    this.settlementId = data.settlementId;
    this.disputeReason = data.disputeReason;
    this.disputedAmount = data.disputedAmount;
    this.disputedBy = data.disputedBy;
    this.metadata = data.metadata || {};
    this.timestamp = new Date();
    this.version = 1;
  }
}

export class SettlementDisputeResolvedEvent {
  constructor(data) {
    this.eventId = data.eventId;
    this.eventType = 'SETTLEMENT_DISPUTE_RESOLVED';
    this.settlementId = data.settlementId;
    this.disputeId = data.disputeId;
    this.resolution = data.resolution;
    this.resolvedAmount = data.resolvedAmount;
    this.resolvedBy = data.resolvedBy;
    this.metadata = data.metadata || {};
    this.timestamp = new Date();
    this.version = 1;
  }
}