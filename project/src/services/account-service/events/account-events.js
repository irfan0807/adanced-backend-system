export class AccountCreatedEvent {
  constructor(data) {
    this.eventType = 'AccountCreated';
    this.aggregateId = data.accountId;
    this.accountId = data.accountId;
    this.userId = data.userId;
    this.accountType = data.accountType;
    this.currency = data.currency;
    this.initialBalance = data.initialBalance;
    this.accountName = data.accountName;
    this.timestamp = data.timestamp;
    this.version = 1;
  }
}

export class AccountUpdatedEvent {
  constructor(data) {
    this.eventType = 'AccountUpdated';
    this.aggregateId = data.accountId;
    this.accountId = data.accountId;
    this.updates = data.updates;
    this.updatedBy = data.updatedBy;
    this.timestamp = data.timestamp;
    this.version = 1;
  }
}

export class AccountSuspendedEvent {
  constructor(data) {
    this.eventType = 'AccountSuspended';
    this.aggregateId = data.accountId;
    this.accountId = data.accountId;
    this.reason = data.reason;
    this.suspendedBy = data.suspendedBy;
    this.timestamp = data.timestamp;
    this.version = 1;
  }
}

export class AccountActivatedEvent {
  constructor(data) {
    this.eventType = 'AccountActivated';
    this.aggregateId = data.accountId;
    this.accountId = data.accountId;
    this.activatedBy = data.activatedBy;
    this.timestamp = data.timestamp;
    this.version = 1;
  }
}

export class AccountClosedEvent {
  constructor(data) {
    this.eventType = 'AccountClosed';
    this.aggregateId = data.accountId;
    this.accountId = data.accountId;
    this.reason = data.reason;
    this.closedBy = data.closedBy;
    this.finalBalance = data.finalBalance;
    this.timestamp = data.timestamp;
    this.version = 1;
  }
}

export class FundsDepositedEvent {
  constructor(data) {
    this.eventType = 'FundsDeposited';
    this.aggregateId = data.accountId;
    this.accountId = data.accountId;
    this.amount = data.amount;
    this.currency = data.currency;
    this.newBalance = data.newBalance;
    this.description = data.description;
    this.reference = data.reference;
    this.depositedBy = data.depositedBy;
    this.timestamp = data.timestamp;
    this.version = 1;
  }
}

export class FundsWithdrawnEvent {
  constructor(data) {
    this.eventType = 'FundsWithdrawn';
    this.aggregateId = data.accountId;
    this.accountId = data.accountId;
    this.amount = data.amount;
    this.currency = data.currency;
    this.newBalance = data.newBalance;
    this.description = data.description;
    this.reference = data.reference;
    this.withdrawnBy = data.withdrawnBy;
    this.timestamp = data.timestamp;
    this.version = 1;
  }
}

export class FundsTransferredEvent {
  constructor(data) {
    this.eventType = 'FundsTransferred';
    this.aggregateId = data.transferId;
    this.transferId = data.transferId;
    this.fromAccountId = data.fromAccountId;
    this.toAccountId = data.toAccountId;
    this.amount = data.amount;
    this.currency = data.currency;
    this.fromAccountNewBalance = data.fromAccountNewBalance;
    this.toAccountNewBalance = data.toAccountNewBalance;
    this.description = data.description;
    this.reference = data.reference;
    this.transferredBy = data.transferredBy;
    this.timestamp = data.timestamp;
    this.version = 1;
  }
}

export class AccountBalanceUpdatedEvent {
  constructor(data) {
    this.eventType = 'AccountBalanceUpdated';
    this.aggregateId = data.accountId;
    this.accountId = data.accountId;
    this.oldBalance = data.oldBalance;
    this.newBalance = data.newBalance;
    this.currency = data.currency;
    this.reason = data.reason;
    this.reference = data.reference;
    this.updatedBy = data.updatedBy;
    this.timestamp = data.timestamp;
    this.version = 1;
  }
}