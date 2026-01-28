export class GetAccountQuery {
  constructor(data) {
    this.accountId = data.accountId;
    this.includeBalance = data.includeBalance !== undefined ? data.includeBalance : true;
    this.includeTransactions = data.includeTransactions || false;
    this.transactionLimit = data.transactionLimit || 10;
    this.includeMetadata = data.includeMetadata !== undefined ? data.includeMetadata : true;
  }

  validate() {
    if (!this.accountId) {
      throw new Error('Account ID is required');
    }

    if (this.transactionLimit < 0 || this.transactionLimit > 100) {
      throw new Error('Transaction limit must be between 0 and 100');
    }
  }
}

export class GetAccountsQuery {
  constructor(data = {}) {
    this.userId = data.userId;
    this.accountType = data.accountType;
    this.currency = data.currency;
    this.status = data.status;
    this.fromDate = data.fromDate;
    this.toDate = data.toDate;
    this.page = data.page || 1;
    this.limit = Math.min(data.limit || 20, 100); // Cap at 100
    this.sortBy = data.sortBy || 'createdAt';
    this.sortOrder = data.sortOrder || 'desc';
    this.includeBalance = data.includeBalance !== undefined ? data.includeBalance : true;
  }

  validate() {
    const validSortFields = ['createdAt', 'updatedAt', 'accountType', 'balance', 'status'];
    const validSortOrders = ['asc', 'desc'];
    const validStatuses = ['active', 'suspended', 'closed'];

    if (!validSortFields.includes(this.sortBy)) {
      throw new Error(`Invalid sortBy field. Must be one of: ${validSortFields.join(', ')}`);
    }

    if (!validSortOrders.includes(this.sortOrder)) {
      throw new Error(`Invalid sortOrder. Must be one of: ${validSortOrders.join(', ')}`);
    }

    if (this.status && !validStatuses.includes(this.status)) {
      throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    if (this.page < 1) {
      throw new Error('Page must be greater than 0');
    }

    if (this.limit < 1 || this.limit > 100) {
      throw new Error('Limit must be between 1 and 100');
    }
  }
}

export class GetAccountBalanceQuery {
  constructor(data) {
    this.accountId = data.accountId;
    this.includePending = data.includePending || false;
    this.includeHistory = data.includeHistory || false;
    this.historyDays = data.historyDays || 30;
  }

  validate() {
    if (!this.accountId) {
      throw new Error('Account ID is required');
    }

    if (this.historyDays < 1 || this.historyDays > 365) {
      throw new Error('History days must be between 1 and 365');
    }
  }
}

export class GetAccountTransactionsQuery {
  constructor(data) {
    this.accountId = data.accountId;
    this.transactionType = data.transactionType; // deposit, withdrawal, transfer
    this.fromDate = data.fromDate;
    this.toDate = data.toDate;
    this.minAmount = data.minAmount;
    this.maxAmount = data.maxAmount;
    this.page = data.page || 1;
    this.limit = Math.min(data.limit || 20, 100);
    this.sortBy = data.sortBy || 'createdAt';
    this.sortOrder = data.sortOrder || 'desc';
  }

  validate() {
    const validSortFields = ['createdAt', 'amount', 'type', 'status'];
    const validSortOrders = ['asc', 'desc'];
    const validTransactionTypes = ['deposit', 'withdrawal', 'transfer'];

    if (!this.accountId) {
      throw new Error('Account ID is required');
    }

    if (!validSortFields.includes(this.sortBy)) {
      throw new Error(`Invalid sortBy field. Must be one of: ${validSortFields.join(', ')}`);
    }

    if (!validSortOrders.includes(this.sortOrder)) {
      throw new Error(`Invalid sortOrder. Must be one of: ${validSortOrders.join(', ')}`);
    }

    if (this.transactionType && !validTransactionTypes.includes(this.transactionType)) {
      throw new Error(`Invalid transaction type. Must be one of: ${validTransactionTypes.join(', ')}`);
    }

    if (this.minAmount !== undefined && this.minAmount < 0) {
      throw new Error('Minimum amount cannot be negative');
    }

    if (this.maxAmount !== undefined && this.maxAmount < 0) {
      throw new Error('Maximum amount cannot be negative');
    }

    if (this.minAmount !== undefined && this.maxAmount !== undefined && this.minAmount > this.maxAmount) {
      throw new Error('Minimum amount cannot be greater than maximum amount');
    }

    if (this.page < 1) {
      throw new Error('Page must be greater than 0');
    }

    if (this.limit < 1 || this.limit > 100) {
      throw new Error('Limit must be between 1 and 100');
    }
  }
}

export class GetAccountStatementQuery {
  constructor(data) {
    this.accountId = data.accountId;
    this.fromDate = data.fromDate;
    this.toDate = data.toDate;
    this.includeOpeningBalance = data.includeOpeningBalance !== undefined ? data.includeOpeningBalance : true;
    this.includeClosingBalance = data.includeClosingBalance !== undefined ? data.includeClosingBalance : true;
    this.groupBy = data.groupBy || 'day'; // day, week, month
    this.format = data.format || 'detailed'; // summary, detailed
  }

  validate() {
    const validGroupBy = ['day', 'week', 'month'];
    const validFormats = ['summary', 'detailed'];

    if (!this.accountId) {
      throw new Error('Account ID is required');
    }

    if (!this.fromDate || !this.toDate) {
      throw new Error('Both fromDate and toDate are required');
    }

    if (new Date(this.fromDate) > new Date(this.toDate)) {
      throw new Error('fromDate cannot be after toDate');
    }

    if (!validGroupBy.includes(this.groupBy)) {
      throw new Error(`Invalid groupBy. Must be one of: ${validGroupBy.join(', ')}`);
    }

    if (!validFormats.includes(this.format)) {
      throw new Error(`Invalid format. Must be one of: ${validFormats.join(', ')}`);
    }
  }
}