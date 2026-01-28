export class CreateAccountCommand {
  constructor(data) {
    this.id = data.id;
    this.userId = data.userId;
    this.accountType = data.accountType || 'checking';
    this.currency = data.currency || 'USD';
    this.initialBalance = data.initialBalance || 0;
    this.accountName = data.accountName;
    this.description = data.description;
    this.metadata = data.metadata || {};
    this.createdAt = data.createdAt;
  }

  validate() {
    const errors = [];

    if (!this.id) errors.push('Account ID is required');
    if (!this.userId) errors.push('User ID is required');
    if (!this.accountType) errors.push('Account type is required');
    if (!this.currency) errors.push('Currency is required');
    if (this.initialBalance < 0) errors.push('Initial balance cannot be negative');

    const validAccountTypes = ['checking', 'savings', 'business', 'investment'];
    if (!validAccountTypes.includes(this.accountType)) {
      errors.push('Invalid account type');
    }

    if (errors.length > 0) {
      throw new Error(`Validation errors: ${errors.join(', ')}`);
    }
  }
}

export class UpdateAccountCommand {
  constructor(data) {
    this.accountId = data.accountId;
    this.updates = data.updates;
    this.updatedBy = data.updatedBy;
    this.updatedAt = data.updatedAt;
    this.metadata = data.metadata || {};
  }

  validate() {
    const errors = [];

    if (!this.accountId) errors.push('Account ID is required');
    if (!this.updates || Object.keys(this.updates).length === 0) {
      errors.push('Updates are required');
    }

    // Validate specific update fields
    if (this.updates.accountType) {
      const validAccountTypes = ['checking', 'savings', 'business', 'investment'];
      if (!validAccountTypes.includes(this.updates.accountType)) {
        errors.push('Invalid account type');
      }
    }

    if (this.updates.currency && !this.updates.currency.match(/^[A-Z]{3}$/)) {
      errors.push('Currency must be a valid 3-letter code');
    }

    if (errors.length > 0) {
      throw new Error(`Validation errors: ${errors.join(', ')}`);
    }
  }
}

export class SuspendAccountCommand {
  constructor(data) {
    this.accountId = data.accountId;
    this.reason = data.reason;
    this.suspendedBy = data.suspendedBy;
    this.suspendedAt = data.suspendedAt;
    this.metadata = data.metadata || {};
  }

  validate() {
    const errors = [];

    if (!this.accountId) errors.push('Account ID is required');
    if (!this.reason) errors.push('Suspension reason is required');
    if (!this.suspendedBy) errors.push('Suspended by is required');

    if (errors.length > 0) {
      throw new Error(`Validation errors: ${errors.join(', ')}`);
    }
  }
}

export class ActivateAccountCommand {
  constructor(data) {
    this.accountId = data.accountId;
    this.activatedBy = data.activatedBy;
    this.activatedAt = data.activatedAt;
    this.metadata = data.metadata || {};
  }

  validate() {
    const errors = [];

    if (!this.accountId) errors.push('Account ID is required');
    if (!this.activatedBy) errors.push('Activated by is required');

    if (errors.length > 0) {
      throw new Error(`Validation errors: ${errors.join(', ')}`);
    }
  }
}

export class CloseAccountCommand {
  constructor(data) {
    this.accountId = data.accountId;
    this.reason = data.reason;
    this.closedBy = data.closedBy;
    this.closedAt = data.closedAt;
    this.metadata = data.metadata || {};
  }

  validate() {
    const errors = [];

    if (!this.accountId) errors.push('Account ID is required');
    if (!this.reason) errors.push('Closure reason is required');
    if (!this.closedBy) errors.push('Closed by is required');

    if (errors.length > 0) {
      throw new Error(`Validation errors: ${errors.join(', ')}`);
    }
  }
}

export class DepositFundsCommand {
  constructor(data) {
    this.accountId = data.accountId;
    this.amount = data.amount;
    this.currency = data.currency;
    this.description = data.description;
    this.reference = data.reference;
    this.depositedBy = data.depositedBy;
    this.depositedAt = data.depositedAt;
    this.metadata = data.metadata || {};
  }

  validate() {
    const errors = [];

    if (!this.accountId) errors.push('Account ID is required');
    if (!this.amount || this.amount <= 0) errors.push('Valid deposit amount is required');
    if (!this.currency) errors.push('Currency is required');
    if (!this.depositedBy) errors.push('Deposited by is required');

    if (errors.length > 0) {
      throw new Error(`Validation errors: ${errors.join(', ')}`);
    }
  }
}

export class WithdrawFundsCommand {
  constructor(data) {
    this.accountId = data.accountId;
    this.amount = data.amount;
    this.currency = data.currency;
    this.description = data.description;
    this.reference = data.reference;
    this.withdrawnBy = data.withdrawnBy;
    this.withdrawnAt = data.withdrawnAt;
    this.metadata = data.metadata || {};
  }

  validate() {
    const errors = [];

    if (!this.accountId) errors.push('Account ID is required');
    if (!this.amount || this.amount <= 0) errors.push('Valid withdrawal amount is required');
    if (!this.currency) errors.push('Currency is required');
    if (!this.withdrawnBy) errors.push('Withdrawn by is required');

    if (errors.length > 0) {
      throw new Error(`Validation errors: ${errors.join(', ')}`);
    }
  }
}

export class TransferFundsCommand {
  constructor(data) {
    this.fromAccountId = data.fromAccountId;
    this.toAccountId = data.toAccountId;
    this.amount = data.amount;
    this.currency = data.currency;
    this.description = data.description;
    this.reference = data.reference;
    this.transferredBy = data.transferredBy;
    this.transferredAt = data.transferredAt;
    this.metadata = data.metadata || {};
  }

  validate() {
    const errors = [];

    if (!this.fromAccountId) errors.push('From account ID is required');
    if (!this.toAccountId) errors.push('To account ID is required');
    if (this.fromAccountId === this.toAccountId) {
      errors.push('From and to accounts cannot be the same');
    }
    if (!this.amount || this.amount <= 0) errors.push('Valid transfer amount is required');
    if (!this.currency) errors.push('Currency is required');
    if (!this.transferredBy) errors.push('Transferred by is required');

    if (errors.length > 0) {
      throw new Error(`Validation errors: ${errors.join(', ')}`);
    }
  }
}