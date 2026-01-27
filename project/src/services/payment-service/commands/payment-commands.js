export class ProcessPaymentCommand {
  constructor(data) {
    this.id = data.id;
    this.amount = data.amount;
    this.currency = data.currency || 'USD';
    this.paymentMethod = data.paymentMethod;
    this.paymentMethodId = data.paymentMethodId; // Tokenized payment method
    this.description = data.description;
    this.customerId = data.customerId;
    this.metadata = data.metadata || {};
    this.capture = data.capture !== false; // Auto-capture by default
    this.createdAt = data.createdAt;
  }

  validate() {
    const errors = [];

    if (!this.id) errors.push('Payment ID is required');
    if (!this.amount || this.amount <= 0) errors.push('Valid amount is required');
    if (!this.currency) errors.push('Currency is required');
    if (!this.paymentMethod) errors.push('Payment method is required');
    if (!this.customerId) errors.push('Customer ID is required');

    const validCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'];
    const validPaymentMethods = ['credit_card', 'debit_card', 'bank_transfer', 'paypal', 'apple_pay', 'google_pay'];

    if (!validCurrencies.includes(this.currency.toUpperCase())) {
      errors.push('Invalid currency');
    }
    if (!validPaymentMethods.includes(this.paymentMethod)) {
      errors.push('Invalid payment method');
    }

    if (errors.length > 0) {
      throw new Error(`Validation errors: ${errors.join(', ')}`);
    }
  }
}

export class CapturePaymentCommand {
  constructor(data) {
    this.paymentId = data.paymentId;
    this.amount = data.amount; // Optional, for partial capture
    this.updatedAt = data.updatedAt;
  }

  validate() {
    const errors = [];

    if (!this.paymentId) errors.push('Payment ID is required');
    if (this.amount && this.amount <= 0) errors.push('Valid capture amount is required');

    if (errors.length > 0) {
      throw new Error(`Validation errors: ${errors.join(', ')}`);
    }
  }
}

export class RefundPaymentCommand {
  constructor(data) {
    this.paymentId = data.paymentId;
    this.refundId = data.refundId;
    this.amount = data.amount;
    this.reason = data.reason;
    this.metadata = data.metadata || {};
    this.createdAt = data.createdAt;
  }

  validate() {
    const errors = [];

    if (!this.paymentId) errors.push('Payment ID is required');
    if (!this.refundId) errors.push('Refund ID is required');
    if (!this.amount || this.amount <= 0) errors.push('Valid refund amount is required');
    if (!this.reason) errors.push('Refund reason is required');

    if (errors.length > 0) {
      throw new Error(`Validation errors: ${errors.join(', ')}`);
    }
  }
}

export class UpdatePaymentStatusCommand {
  constructor(data) {
    this.paymentId = data.paymentId;
    this.status = data.status;
    this.failureReason = data.failureReason;
    this.gatewayResponse = data.gatewayResponse;
    this.updatedAt = data.updatedAt;
  }

  validate() {
    const errors = [];
    const validStatuses = ['pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded', 'partially_refunded'];

    if (!this.paymentId) errors.push('Payment ID is required');
    if (!this.status) errors.push('Status is required');
    if (!validStatuses.includes(this.status)) errors.push('Invalid status');

    if (this.status === 'failed' && !this.failureReason) {
      errors.push('Failure reason is required when status is failed');
    }

    if (errors.length > 0) {
      throw new Error(`Validation errors: ${errors.join(', ')}`);
    }
  }
}

export class AddPaymentMethodCommand {
  constructor(data) {
    this.id = data.id;
    this.customerId = data.customerId;
    this.type = data.type; // credit_card, debit_card, bank_account
    this.token = data.token; // Tokenized payment method data
    this.isDefault = data.isDefault || false;
    this.metadata = data.metadata || {};
    this.createdAt = data.createdAt;
  }

  validate() {
    const errors = [];
    const validTypes = ['credit_card', 'debit_card', 'bank_account'];

    if (!this.id) errors.push('Payment method ID is required');
    if (!this.customerId) errors.push('Customer ID is required');
    if (!this.type) errors.push('Payment method type is required');
    if (!this.token) errors.push('Token is required');

    if (!validTypes.includes(this.type)) {
      errors.push('Invalid payment method type');
    }

    if (errors.length > 0) {
      throw new Error(`Validation errors: ${errors.join(', ')}`);
    }
  }
}

export class CreateSubscriptionCommand {
  constructor(data) {
    this.id = data.id;
    this.customerId = data.customerId;
    this.paymentMethodId = data.paymentMethodId;
    this.amount = data.amount;
    this.currency = data.currency || 'USD';
    this.interval = data.interval; // day, week, month, year
    this.intervalCount = data.intervalCount || 1;
    this.description = data.description;
    this.metadata = data.metadata || {};
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.createdAt = data.createdAt;
  }

  validate() {
    const errors = [];
    const validIntervals = ['day', 'week', 'month', 'year'];

    if (!this.id) errors.push('Subscription ID is required');
    if (!this.customerId) errors.push('Customer ID is required');
    if (!this.paymentMethodId) errors.push('Payment method ID is required');
    if (!this.amount || this.amount <= 0) errors.push('Valid amount is required');
    if (!this.interval) errors.push('Billing interval is required');

    if (!validIntervals.includes(this.interval)) {
      errors.push('Invalid billing interval');
    }
    if (this.intervalCount < 1) {
      errors.push('Interval count must be at least 1');
    }

    if (this.startDate && new Date(this.startDate) <= new Date()) {
      errors.push('Start date must be in the future');
    }

    if (errors.length > 0) {
      throw new Error(`Validation errors: ${errors.join(', ')}`);
    }
  }
}