import {
  GetAccountQuery,
  GetAccountsQuery,
  GetAccountBalanceQuery,
  GetAccountTransactionsQuery,
  GetAccountStatementQuery
} from '../queries/account-queries.js';

export class AccountQueryHandler {
  constructor(dependencies) {
    this.connectionPool = dependencies.connectionPool;
    this.cache = dependencies.cache || new Map();
    this.logger = dependencies.logger;
  }

  async handle(query) {
    try {
      query.validate();

      switch (query.constructor.name) {
        case 'GetAccountQuery':
          return await this.handleGetAccount(query);
        case 'GetAccountsQuery':
          return await this.handleGetAccounts(query);
        case 'GetAccountBalanceQuery':
          return await this.handleGetAccountBalance(query);
        case 'GetAccountTransactionsQuery':
          return await this.handleGetAccountTransactions(query);
        case 'GetAccountStatementQuery':
          return await this.handleGetAccountStatement(query);
        default:
          throw new Error(`Unknown query type: ${query.constructor.name}`);
      }
    } catch (error) {
      this.logger.error(`Error handling query ${query.constructor.name}:`, error);
      throw error;
    }
  }

  async handleGetAccount(query) {
    const cacheKey = `account:${query.accountId}`;
    let account = this.cache.get(cacheKey);

    if (!account) {
      account = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute(
          'SELECT * FROM accounts WHERE id = ?',
          [query.accountId]
        );
        return rows[0];
      });

      if (account) {
        this.cache.set(cacheKey, account);
      }
    }

    if (!account) {
      throw new Error('Account not found');
    }

    this.logger.info('Account retrieved successfully', { accountId: query.accountId });
    return account;
  }

  async handleGetAccounts(query) {
    const cacheKey = `accounts:${JSON.stringify(query.filters)}:${query.page}:${query.limit}`;
    let result = this.cache.get(cacheKey);

    if (!result) {
      result = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        let whereClause = '1=1';
        const params = [];

        if (query.filters.userId) {
          whereClause += ' AND user_id = ?';
          params.push(query.filters.userId);
        }

        if (query.filters.accountType) {
          whereClause += ' AND account_type = ?';
          params.push(query.filters.accountType);
        }

        if (query.filters.currency) {
          whereClause += ' AND currency = ?';
          params.push(query.filters.currency);
        }

        if (query.filters.status) {
          whereClause += ' AND status = ?';
          params.push(query.filters.status);
        }

        const offset = (query.page - 1) * query.limit;

        // Get total count
        const [countResult] = await connection.execute(
          `SELECT COUNT(*) as total FROM accounts WHERE ${whereClause}`,
          params
        );
        const total = countResult[0].total;

        // Get paginated results
        const [rows] = await connection.execute(
          `SELECT * FROM accounts WHERE ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
          [...params, query.limit, offset]
        );

        return {
          accounts: rows,
          pagination: {
            page: query.page,
            limit: query.limit,
            total,
            totalPages: Math.ceil(total / query.limit)
          }
        };
      });

      this.cache.set(cacheKey, result);
    }

    this.logger.info('Accounts retrieved successfully', {
      filters: query.filters,
      page: query.page,
      count: result.accounts.length
    });
    return result;
  }

  async handleGetAccountBalance(query) {
    const cacheKey = `balance:${query.accountId}`;
    let balance = this.cache.get(cacheKey);

    if (balance === undefined) {
      const account = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute(
          'SELECT balance, currency FROM accounts WHERE id = ?',
          [query.accountId]
        );
        return rows[0];
      });

      if (!account) {
        throw new Error('Account not found');
      }

      balance = {
        accountId: query.accountId,
        balance: account.balance,
        currency: account.currency,
        lastUpdated: new Date().toISOString()
      };

      this.cache.set(cacheKey, balance);
    }

    this.logger.info('Account balance retrieved successfully', { accountId: query.accountId });
    return balance;
  }

  async handleGetAccountTransactions(query) {
    const cacheKey = `transactions:${query.accountId}:${query.startDate}:${query.endDate}:${query.page}:${query.limit}`;
    let result = this.cache.get(cacheKey);

    if (!result) {
      result = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const params = [query.accountId];
        let dateFilter = '';

        if (query.startDate && query.endDate) {
          dateFilter = ' AND created_at BETWEEN ? AND ?';
          params.push(query.startDate, query.endDate);
        } else if (query.startDate) {
          dateFilter = ' AND created_at >= ?';
          params.push(query.startDate);
        } else if (query.endDate) {
          dateFilter = ' AND created_at <= ?';
          params.push(query.endDate);
        }

        const offset = (query.page - 1) * query.limit;

        // Get total count
        const [countResult] = await connection.execute(
          `SELECT COUNT(*) as total FROM account_transactions WHERE account_id = ?${dateFilter}`,
          params
        );
        const total = countResult[0].total;

        // Get paginated transactions
        const [rows] = await connection.execute(
          `SELECT * FROM account_transactions WHERE account_id = ?${dateFilter} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
          [...params, query.limit, offset]
        );

        return {
          transactions: rows,
          pagination: {
            page: query.page,
            limit: query.limit,
            total,
            totalPages: Math.ceil(total / query.limit)
          }
        };
      });

      this.cache.set(cacheKey, result);
    }

    this.logger.info('Account transactions retrieved successfully', {
      accountId: query.accountId,
      count: result.transactions.length
    });
    return result;
  }

  async handleGetAccountStatement(query) {
    const cacheKey = `statement:${query.accountId}:${query.startDate}:${query.endDate}`;
    let statement = this.cache.get(cacheKey);

    if (!statement) {
      const account = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute(
          'SELECT * FROM accounts WHERE id = ?',
          [query.accountId]
        );
        return rows[0];
      });

      if (!account) {
        throw new Error('Account not found');
      }

      // Get transactions for the period
      const transactions = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const params = [query.accountId, query.startDate, query.endDate];
        const [rows] = await connection.execute(
          'SELECT * FROM account_transactions WHERE account_id = ? AND created_at BETWEEN ? AND ? ORDER BY created_at ASC',
          params
        );
        return rows;
      });

      // Calculate running balance
      let runningBalance = account.balance;
      const statementLines = transactions.map(transaction => {
        const line = {
          date: transaction.created_at,
          description: transaction.description,
          type: transaction.type,
          amount: transaction.amount,
          balance: runningBalance
        };

        // Adjust running balance based on transaction type
        if (transaction.type === 'deposit' || (transaction.type === 'transfer' && transaction.amount > 0)) {
          runningBalance -= transaction.amount;
        } else if (transaction.type === 'withdrawal' || (transaction.type === 'transfer' && transaction.amount < 0)) {
          runningBalance += Math.abs(transaction.amount);
        }

        return line;
      });

      // Calculate summary
      const deposits = transactions.filter(t => t.type === 'deposit' || (t.type === 'transfer' && t.amount > 0));
      const withdrawals = transactions.filter(t => t.type === 'withdrawal' || (t.type === 'transfer' && t.amount < 0));

      const totalDeposits = deposits.reduce((sum, t) => sum + t.amount, 0);
      const totalWithdrawals = withdrawals.reduce((sum, t) => sum + Math.abs(t.amount), 0);

      statement = {
        account: {
          id: account.id,
          accountName: account.account_name,
          accountType: account.account_type,
          currency: account.currency
        },
        period: {
          startDate: query.startDate,
          endDate: query.endDate
        },
        openingBalance: account.balance - totalDeposits + totalWithdrawals,
        closingBalance: account.balance,
        summary: {
          totalDeposits,
          totalWithdrawals,
          netMovement: totalDeposits - totalWithdrawals
        },
        transactions: statementLines,
        generatedAt: new Date().toISOString()
      };

      this.cache.set(cacheKey, statement);
    }

    this.logger.info('Account statement generated successfully', {
      accountId: query.accountId,
      transactionCount: statement.transactions.length
    });
    return statement;
  }
}