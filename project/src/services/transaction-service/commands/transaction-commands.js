export class CreateTransactionCommand {
  constructor(data) {
    this.id = data.id;
    this.userId = data.userId;
    this.fromAccount = data.fromAccount;
    this.toAccount = data.toAccount;
    this.amount = data.amount;
    this.currency = data.currency || 'USD';
    this.type = data.type;
    this.description = data.description;
    this.metadata = data.metadata || {};
    this.status = data.status;
    this.createdAt = data.createdAt;
  }

  validate() {
    const errors = [];

    if (!this.id) errors.push('Transaction ID is required');
    if (!this.userId) errors.push('User ID is required');
    if (!this.amount || this.amount <= 0) errors.push('Valid amount is required');
    if (!this.type) errors.push('Transaction type is required');

    if (this.type === 'transfer') {
      if (!this.fromAccount) errors.push('From account is required for transfers');
      if (!this.toAccount) errors.push('To account is required for transfers');
    }

    if (errors.length > 0) {
      throw new Error(`Validation errors: ${errors.join(', ')}`);
    }
  }
}

export class UpdateTransactionStatusCommand {
  constructor(data) {
    this.transactionId = data.transactionId;
    this.status = data.status;
    this.reason = data.reason;
    this.updatedAt = data.updatedAt;
    this.metadata = data.metadata || {};
  }

  validate() {
    const errors = [];
    const validStatuses = ['pending', 'processing', 'completed', 'failed', 'cancelled', 'suspended'];

    if (!this.transactionId) errors.push('Transaction ID is required');
    if (!this.status) errors.push('Status is required');
    if (!validStatuses.includes(this.status)) {
      errors.push(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    if (errors.length > 0) {
      throw new Error(`Validation errors: ${errors.join(', ')}`);
    }
  }
}

export class CancelTransactionCommand {
  constructor(data) {
    this.transactionId = data.transactionId;
    this.reason = data.reason;
    this.cancelledAt = data.cancelledAt;
    this.userId = data.userId;
  }

  validate() {
    const errors = [];

    if (!this.transactionId) errors.push('Transaction ID is required');
    if (!this.reason) errors.push('Cancellation reason is required');

    if (errors.length > 0) {
      throw new Error(`Validation errors: ${errors.join(', ')}`);
    }
  }
}