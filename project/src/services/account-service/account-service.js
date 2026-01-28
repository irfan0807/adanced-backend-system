import { v4 as uuidv4 } from 'uuid';
import { AccountCommandHandler } from './handlers/account-command-handler.js';
import { AccountQueryHandler } from './handlers/account-query-handler.js';
import {
  CreateAccountCommand,
  UpdateAccountCommand,
  SuspendAccountCommand,
  ActivateAccountCommand,
  CloseAccountCommand,
  DepositFundsCommand,
  WithdrawFundsCommand,
  TransferFundsCommand
} from './commands/account-commands.js';
import {
  GetAccountQuery,
  GetAccountsQuery,
  GetAccountBalanceQuery,
  GetAccountTransactionsQuery,
  GetAccountStatementQuery
} from './queries/account-queries.js';
import { KafkaService } from '../../shared/messaging/kafka-service.js';
import EventStore from '../../shared/event-sourcing/event-store.js';
import CommandBus from '../../shared/cqrs/command-bus.js';
import QueryBus from '../../shared/cqrs/query-bus.js';

export class AccountService {
  constructor(dependencies) {
    this.connectionPool = dependencies.connectionPool;
    this.dualWriter = dependencies.dualWriter;
    this.eventStore = dependencies.eventStore || new EventStore(dependencies.connectionPool, dependencies.kafkaService);
    this.commandBus = dependencies.commandBus || new CommandBus();
    this.queryBus = dependencies.queryBus || new QueryBus();
    this.kafkaService = dependencies.kafkaService || new KafkaService();
    this.logger = dependencies.logger;

    // Initialize cache
    this.cache = new Map();

    this.commandHandler = new AccountCommandHandler({
      connectionPool: this.connectionPool,
      dualWriter: this.dualWriter,
      eventStore: this.eventStore,
      kafkaService: this.kafkaService,
      logger: this.logger
    });

    this.queryHandler = new AccountQueryHandler({
      connectionPool: this.connectionPool,
      cache: this.cache,
      logger: this.logger
    });
  }

  async initialize() {
    // Register command handlers
    this.commandBus.registerHandler('CreateAccountCommand', this.commandHandler);
    this.commandBus.registerHandler('UpdateAccountCommand', this.commandHandler);
    this.commandBus.registerHandler('SuspendAccountCommand', this.commandHandler);
    this.commandBus.registerHandler('ActivateAccountCommand', this.commandHandler);
    this.commandBus.registerHandler('CloseAccountCommand', this.commandHandler);
    this.commandBus.registerHandler('DepositFundsCommand', this.commandHandler);
    this.commandBus.registerHandler('WithdrawFundsCommand', this.commandHandler);
    this.commandBus.registerHandler('TransferFundsCommand', this.commandHandler);

    // Register query handlers
    this.queryBus.registerHandler('GetAccountQuery', this.queryHandler);
    this.queryBus.registerHandler('GetAccountsQuery', this.queryHandler);
    this.queryBus.registerHandler('GetAccountBalanceQuery', this.queryHandler);
    this.queryBus.registerHandler('GetAccountTransactionsQuery', this.queryHandler);
    this.queryBus.registerHandler('GetAccountStatementQuery', this.queryHandler);

    // Setup event handlers
    await this.setupEventHandlers();

    // Start cache cleanup
    this.startCacheCleanup();

    this.logger.info('AccountService initialized successfully');
  }

  async setupEventHandlers() {
    // Subscribe to account-related events from other services
    await this.kafkaService.subscribe('user-events', async (event) => {
      if (event.eventType === 'UserCreated') {
        // Create default account for new user
        try {
          const command = new CreateAccountCommand({
            id: uuidv4(),
            userId: event.userId,
            accountType: 'checking',
            currency: 'USD',
            initialBalance: 0,
            accountName: 'Primary Checking Account',
            description: 'Default account created for new user',
            metadata: { autoCreated: true }
          });
          await this.commandBus.execute(command);
          this.logger.info('Default account created for new user', { userId: event.userId });
        } catch (error) {
          this.logger.error('Failed to create default account for user', { userId: event.userId, error });
        }
      }
    });

    // Subscribe to transaction events that might affect accounts
    await this.kafkaService.subscribe('transaction-events', async (event) => {
      if (event.eventType === 'TransactionCompleted') {
        // Invalidate cache for affected accounts
        this.cache.delete(`account:${event.fromAccountId}`);
        this.cache.delete(`account:${event.toAccountId}`);
        this.cache.delete(`balance:${event.fromAccountId}`);
        this.cache.delete(`balance:${event.toAccountId}`);
      }
    });

    this.logger.info('Event handlers setup completed');
  }

  startCacheCleanup() {
    // Clean up cache every 5 minutes
    setInterval(() => {
      this.cache.clear();
      this.logger.debug('Account cache cleared');
    }, 5 * 60 * 1000);
  }

  // Command methods
  async createAccount(data) {
    const command = new CreateAccountCommand({
      id: data.id || uuidv4(),
      userId: data.userId,
      accountType: data.accountType,
      currency: data.currency,
      initialBalance: data.initialBalance || 0,
      accountName: data.accountName,
      description: data.description,
      metadata: data.metadata
    });
    return await this.commandBus.execute(command);
  }

  async updateAccount(accountId, updates) {
    const command = new UpdateAccountCommand({
      accountId,
      updates,
      updatedBy: updates.updatedBy
    });
    return await this.commandBus.execute(command);
  }

  async suspendAccount(accountId, reason, suspendedBy) {
    const command = new SuspendAccountCommand({
      accountId,
      reason,
      suspendedBy
    });
    return await this.commandBus.execute(command);
  }

  async activateAccount(accountId, activatedBy) {
    const command = new ActivateAccountCommand({
      accountId,
      activatedBy
    });
    return await this.commandBus.execute(command);
  }

  async closeAccount(accountId, reason, closedBy) {
    const command = new CloseAccountCommand({
      accountId,
      reason,
      closedBy
    });
    return await this.commandBus.execute(command);
  }

  async depositFunds(accountId, amount, currency, description, reference, depositedBy) {
    const command = new DepositFundsCommand({
      accountId,
      amount,
      currency,
      description,
      reference,
      depositedBy
    });
    return await this.commandBus.execute(command);
  }

  async withdrawFunds(accountId, amount, currency, description, reference, withdrawnBy) {
    const command = new WithdrawFundsCommand({
      accountId,
      amount,
      currency,
      description,
      reference,
      withdrawnBy
    });
    return await this.commandBus.execute(command);
  }

  async transferFunds(fromAccountId, toAccountId, amount, currency, description, reference, transferredBy) {
    const command = new TransferFundsCommand({
      fromAccountId,
      toAccountId,
      amount,
      currency,
      description,
      reference,
      transferredBy
    });
    return await this.commandBus.execute(command);
  }

  // Query methods
  async getAccount(accountId) {
    const query = new GetAccountQuery({ accountId });
    return await this.queryBus.execute(query);
  }

  async getAccounts(filters = {}, page = 1, limit = 10) {
    const query = new GetAccountsQuery({ filters, page, limit });
    return await this.queryBus.execute(query);
  }

  async getAccountBalance(accountId) {
    const query = new GetAccountBalanceQuery({ accountId });
    return await this.queryBus.execute(query);
  }

  async getAccountTransactions(accountId, startDate, endDate, page = 1, limit = 20) {
    const query = new GetAccountTransactionsQuery({
      accountId,
      startDate,
      endDate,
      page,
      limit
    });
    return await this.queryBus.execute(query);
  }

  async getAccountStatement(accountId, startDate, endDate) {
    const query = new GetAccountStatementQuery({
      accountId,
      startDate,
      endDate
    });
    return await this.queryBus.execute(query);
  }

  // Utility methods
  async getAccountSummary(userId) {
    const accounts = await this.getAccounts({ userId }, 1, 100);
    const summary = {
      userId,
      totalAccounts: accounts.accounts.length,
      totalBalance: 0,
      accountsByType: {},
      accountsByCurrency: {}
    };

    accounts.accounts.forEach(account => {
      summary.totalBalance += account.balance;

      // Group by type
      if (!summary.accountsByType[account.account_type]) {
        summary.accountsByType[account.account_type] = 0;
      }
      summary.accountsByType[account.account_type]++;

      // Group by currency
      if (!summary.accountsByCurrency[account.currency]) {
        summary.accountsByCurrency[account.currency] = 0;
      }
      summary.accountsByCurrency[account.currency]++;
    });

    return summary;
  }

  async validateAccountTransfer(fromAccountId, toAccountId, amount) {
    const [fromAccount, toAccount] = await Promise.all([
      this.getAccount(fromAccountId),
      this.getAccount(toAccountId)
    ]);

    const errors = [];

    if (!fromAccount) {
      errors.push('Source account not found');
    } else {
      if (fromAccount.status !== 'active') {
        errors.push('Source account is not active');
      }
      if (fromAccount.balance < amount) {
        errors.push('Insufficient funds in source account');
      }
    }

    if (!toAccount) {
      errors.push('Destination account not found');
    } else {
      if (toAccount.status !== 'active') {
        errors.push('Destination account is not active');
      }
    }

    if (fromAccount && toAccount && fromAccount.currency !== toAccount.currency) {
      errors.push('Currency mismatch between accounts');
    }

    return {
      isValid: errors.length === 0,
      errors,
      fromAccount,
      toAccount
    };
  }
}