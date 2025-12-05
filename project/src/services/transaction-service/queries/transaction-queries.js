export class GetTransactionQuery {
  constructor(data) {
    this.transactionId = data.transactionId;
    this.includeHistory = data.includeHistory || false;
    this.includeMetadata = data.includeMetadata || true;
  }

  validate() {
    if (!this.transactionId) {
      throw new Error('Transaction ID is required');
    }
  }
}

export class GetTransactionsQuery {
  constructor(data) {
    this.userId = data.userId;
    this.accountId = data.accountId;
    this.status = data.status;
    this.type = data.type;
    this.fromDate = data.fromDate;
    this.toDate = data.toDate;
    this.page = data.page || 1;
    this.limit = Math.min(data.limit || 20, 100); // Cap at 100
    this.sortBy = data.sortBy || 'createdAt';
    this.sortOrder = data.sortOrder || 'desc';
  }

  validate() {
    const validSortFields = ['createdAt', 'updatedAt', 'amount', 'status'];
    const validSortOrders = ['asc', 'desc'];

    if (!validSortFields.includes(this.sortBy)) {
      throw new Error(`Invalid sortBy field. Must be one of: ${validSortFields.join(', ')}`);
    }

    if (!validSortOrders.includes(this.sortOrder)) {
      throw new Error(`Invalid sortOrder. Must be one of: ${validSortOrders.join(', ')}`);
    }

    if (this.page < 1) {
      throw new Error('Page must be greater than 0');
    }

    if (this.limit < 1 || this.limit > 100) {
      throw new Error('Limit must be between 1 and 100');
    }
  }
}

export class GetTransactionHistoryQuery {
  constructor(data) {
    this.transactionId = data.transactionId;
    this.fromDate = data.fromDate;
    this.toDate = data.toDate;
  }

  validate() {
    if (!this.transactionId) {
      throw new Error('Transaction ID is required');
    }
  }
}

export class GetTransactionAnalyticsQuery {
  constructor(data) {
    this.userId = data.userId;
    this.fromDate = data.fromDate;
    this.toDate = data.toDate;
    this.groupBy = data.groupBy || 'day'; // day, week, month
    this.metrics = data.metrics || ['count', 'sum', 'avg'];
  }

  validate() {
    const validGroupBy = ['day', 'week', 'month'];
    const validMetrics = ['count', 'sum', 'avg', 'max', 'min'];

    if (!validGroupBy.includes(this.groupBy)) {
      throw new Error(`Invalid groupBy. Must be one of: ${validGroupBy.join(', ')}`);
    }

    const invalidMetrics = this.metrics.filter(m => !validMetrics.includes(m));
    if (invalidMetrics.length > 0) {
      throw new Error(`Invalid metrics: ${invalidMetrics.join(', ')}`);
    }
  }
}