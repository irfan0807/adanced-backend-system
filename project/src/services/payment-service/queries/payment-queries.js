export class GetPaymentQuery {
  constructor(data) {
    this.paymentId = data.paymentId;
  }

  validate() {
    if (!this.paymentId) {
      throw new Error('Payment ID is required');
    }
  }
}

export class GetPaymentsQuery {
  constructor(data) {
    this.customerId = data.customerId;
    this.status = data.status;
    this.paymentMethod = data.paymentMethod;
    this.currency = data.currency;
    this.minAmount = data.minAmount;
    this.maxAmount = data.maxAmount;
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.page = data.page || 1;
    this.limit = data.limit || 20;
    this.sortBy = data.sortBy || 'createdAt';
    this.sortOrder = data.sortOrder || 'desc';
  }

  validate() {
    const validSortFields = ['createdAt', 'amount', 'status', 'updatedAt'];
    const validSortOrders = ['asc', 'desc'];

    if (this.page < 1) {
      throw new Error('Page must be greater than 0');
    }
    if (this.limit < 1 || this.limit > 100) {
      throw new Error('Limit must be between 1 and 100');
    }
    if (!validSortFields.includes(this.sortBy)) {
      throw new Error(`Invalid sort field: ${this.sortBy}`);
    }
    if (!validSortOrders.includes(this.sortOrder)) {
      throw new Error(`Invalid sort order: ${this.sortOrder}`);
    }
  }
}

export class GetPaymentStatisticsQuery {
  constructor(data) {
    this.customerId = data.customerId;
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.currency = data.currency;
    this.groupBy = data.groupBy || 'day'; // day, week, month, payment_method
  }

  validate() {
    const validGroupBy = ['day', 'week', 'month', 'payment_method', 'currency', 'status'];

    if (!validGroupBy.includes(this.groupBy)) {
      throw new Error(`Invalid group by: ${this.groupBy}`);
    }
  }
}

export class GetPaymentMethodsQuery {
  constructor(data) {
    this.customerId = data.customerId;
    this.type = data.type;
    this.active = data.active !== false; // Default to true
    this.page = data.page || 1;
    this.limit = data.limit || 20;
  }

  validate() {
    if (this.page < 1) {
      throw new Error('Page must be greater than 0');
    }
    if (this.limit < 1 || this.limit > 100) {
      throw new Error('Limit must be between 1 and 100');
    }
  }
}

export class GetSubscriptionsQuery {
  constructor(data) {
    this.customerId = data.customerId;
    this.status = data.status; // active, cancelled, past_due
    this.paymentMethodId = data.paymentMethodId;
    this.page = data.page || 1;
    this.limit = data.limit || 20;
    this.sortBy = data.sortBy || 'createdAt';
    this.sortOrder = data.sortOrder || 'desc';
  }

  validate() {
    const validStatuses = ['active', 'cancelled', 'past_due', 'incomplete'];
    const validSortFields = ['createdAt', 'nextBillingDate', 'amount'];
    const validSortOrders = ['asc', 'desc'];

    if (this.status && !validStatuses.includes(this.status)) {
      throw new Error(`Invalid status: ${this.status}`);
    }
    if (this.page < 1) {
      throw new Error('Page must be greater than 0');
    }
    if (this.limit < 1 || this.limit > 100) {
      throw new Error('Limit must be between 1 and 100');
    }
    if (!validSortFields.includes(this.sortBy)) {
      throw new Error(`Invalid sort field: ${this.sortBy}`);
    }
    if (!validSortOrders.includes(this.sortOrder)) {
      throw new Error(`Invalid sort order: ${this.sortOrder}`);
    }
  }
}

export class GetRefundsQuery {
  constructor(data) {
    this.paymentId = data.paymentId;
    this.status = data.status;
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.page = data.page || 1;
    this.limit = data.limit || 20;
  }

  validate() {
    const validStatuses = ['pending', 'processing', 'completed', 'failed'];

    if (this.status && !validStatuses.includes(this.status)) {
      throw new Error(`Invalid status: ${this.status}`);
    }
    if (this.page < 1) {
      throw new Error('Page must be greater than 0');
    }
    if (this.limit < 1 || this.limit > 100) {
      throw new Error('Limit must be between 1 and 100');
    }
  }
}

export class GetDisputesQuery {
  constructor(data) {
    this.paymentId = data.paymentId;
    this.status = data.status; // opened, won, lost
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.page = data.page || 1;
    this.limit = data.limit || 20;
  }

  validate() {
    const validStatuses = ['opened', 'won', 'lost', 'under_review'];

    if (this.status && !validStatuses.includes(this.status)) {
      throw new Error(`Invalid status: ${this.status}`);
    }
    if (this.page < 1) {
      throw new Error('Page must be greater than 0');
    }
    if (this.limit < 1 || this.limit > 100) {
      throw new Error('Limit must be between 1 and 100');
    }
  }
}

export class GetFraudAlertsQuery {
  constructor(data) {
    this.customerId = data.customerId;
    this.minRiskScore = data.minRiskScore || 0;
    this.maxRiskScore = data.maxRiskScore || 100;
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.page = data.page || 1;
    this.limit = data.limit || 20;
  }

  validate() {
    if (this.minRiskScore < 0 || this.minRiskScore > 100) {
      throw new Error('Min risk score must be between 0 and 100');
    }
    if (this.maxRiskScore < 0 || this.maxRiskScore > 100) {
      throw new Error('Max risk score must be between 0 and 100');
    }
    if (this.minRiskScore > this.maxRiskScore) {
      throw new Error('Min risk score cannot be greater than max risk score');
    }
    if (this.page < 1) {
      throw new Error('Page must be greater than 0');
    }
    if (this.limit < 1 || this.limit > 100) {
      throw new Error('Limit must be between 1 and 100');
    }
  }
}