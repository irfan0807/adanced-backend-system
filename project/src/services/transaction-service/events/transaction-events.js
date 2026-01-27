export class TransactionCreatedEvent {
  constructor(data) {
    this.eventType = 'TransactionCreated';
    this.aggregateId = data.transactionId;
    this.transactionId = data.transactionId;
    this.userId = data.userId;
    this.amount = data.amount;
    this.currency = data.currency;
    this.type = data.type;
    this.timestamp = data.timestamp;
    this.version = 1;
  }
}

export class TransactionStatusUpdatedEvent {
  constructor(data) {
    this.eventType = 'TransactionStatusUpdated';
    this.aggregateId = data.transactionId;
    this.transactionId = data.transactionId;
    this.oldStatus = data.oldStatus;
    this.newStatus = data.newStatus;
    this.reason = data.reason;
    this.timestamp = data.timestamp;
    this.version = 1;
  }
}

export class TransactionAmountUpdatedEvent {
  constructor(data) {
    this.eventType = 'TransactionAmountUpdated';
    this.aggregateId = data.transactionId;
    this.transactionId = data.transactionId;
    this.oldAmount = data.oldAmount;
    this.newAmount = data.newAmount;
    this.reason = data.reason;
    this.timestamp = data.timestamp;
    this.version = 1;
  }
}

export class TransactionCancelledEvent {
  constructor(data) {
    this.eventType = 'TransactionCancelled';
    this.aggregateId = data.transactionId;
    this.transactionId = data.transactionId;
    this.reason = data.reason;
    this.cancelledBy = data.cancelledBy;
    this.timestamp = data.timestamp;
    this.version = 1;
  }
}