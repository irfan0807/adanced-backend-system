import { GetTransactionQuery, GetTransactionsQuery } from '../queries/transaction-queries.js';

export class TransactionQueryHandler {
  constructor(dependencies) {
    this.connectionPool = dependencies.connectionPool;
    this.eventStore = dependencies.eventStore;
    this.logger = dependencies.logger;
  }

  async handle(query) {
    if (query instanceof GetTransactionQuery) {
      return await this.handleGetTransaction(query);
    } else if (query instanceof GetTransactionsQuery) {
      return await this.handleGetTransactions(query);
    } else {
      throw new Error(`Unknown query type: ${query.constructor.name}`);
    }
  }

  async handleGetTransaction(query) {
    try {
      // Validate query
      query.validate();

      // Get transaction from database
      const db = this.connectionPool.getMongoDatabase();
      const transaction = await db.collection('transactions').findOne({
        id: query.transactionId
      });

      if (!transaction) {
        return {
          success: false,
          error: 'Transaction not found'
        };
      }

      // If history is requested, get events from event store
      let history = [];
      if (query.includeHistory) {
        history = await this.eventStore.getEventsForAggregate(query.transactionId);
      }

      // Remove sensitive metadata if not requested
      const result = { ...transaction };
      if (!query.includeMetadata && result.metadata) {
        delete result.metadata;
      }

      this.logger.info('Transaction retrieved successfully', {
        transactionId: query.transactionId
      });

      return {
        success: true,
        transaction: result,
        history: query.includeHistory ? history : undefined
      };

    } catch (error) {
      this.logger.error('Failed to get transaction', {
        transactionId: query.transactionId,
        error: error.message
      });
      throw error;
    }
  }

  async handleGetTransactions(query) {
    try {
      // Validate query
      query.validate();

      // Build MongoDB query
      const db = this.connectionPool.getMongoDatabase();
      const collection = db.collection('transactions');

      const mongoQuery = {};
      if (query.userId) mongoQuery.userId = query.userId;
      if (query.accountId) {
        mongoQuery.$or = [
          { fromAccount: query.accountId },
          { toAccount: query.accountId }
        ];
      }
      if (query.status) mongoQuery.status = query.status;
      if (query.type) mongoQuery.type = query.type;

      // Date range filter
      if (query.fromDate || query.toDate) {
        mongoQuery.createdAt = {};
        if (query.fromDate) mongoQuery.createdAt.$gte = query.fromDate;
        if (query.toDate) mongoQuery.createdAt.$lte = query.toDate;
      }

      // Build sort
      const sort = {};
      sort[query.sortBy] = query.sortOrder === 'desc' ? -1 : 1;

      // Execute query with pagination
      const skip = (query.page - 1) * query.limit;
      const transactions = await collection
        .find(mongoQuery)
        .sort(sort)
        .skip(skip)
        .limit(query.limit)
        .toArray();

      // Get total count for pagination
      const total = await collection.countDocuments(mongoQuery);

      this.logger.info('Transactions retrieved successfully', {
        query: mongoQuery,
        count: transactions.length,
        total
      });

      return {
        success: true,
        transactions,
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit)
        }
      };

    } catch (error) {
      this.logger.error('Failed to get transactions', {
        error: error.message,
        query: query
      });
      throw error;
    }
  }
}