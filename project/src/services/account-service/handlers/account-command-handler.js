import {
  CreateAccountCommand,
  UpdateAccountCommand,
  SuspendAccountCommand,
  ActivateAccountCommand,
  CloseAccountCommand,
  DepositFundsCommand,
  WithdrawFundsCommand,
  TransferFundsCommand
} from '../commands/account-commands.js';
import {
  AccountCreatedEvent,
  AccountUpdatedEvent,
  AccountSuspendedEvent,
  AccountActivatedEvent,
  AccountClosedEvent,
  FundsDepositedEvent,
  FundsWithdrawnEvent,
  FundsTransferredEvent,
  AccountBalanceUpdatedEvent
} from '../events/account-events.js';

export class AccountCommandHandler {
  constructor(dependencies) {
    this.connectionPool = dependencies.connectionPool;
    this.dualWriter = dependencies.dualWriter;
    this.eventStore = dependencies.eventStore;
    this.kafkaService = dependencies.kafkaService;
    this.logger = dependencies.logger;
  }

  async handle(command) {
    try {
      command.validate();

      switch (command.constructor.name) {
        case 'CreateAccountCommand':
          return await this.handleCreateAccount(command);
        case 'UpdateAccountCommand':
          return await this.handleUpdateAccount(command);
        case 'SuspendAccountCommand':
          return await this.handleSuspendAccount(command);
        case 'ActivateAccountCommand':
          return await this.handleActivateAccount(command);
        case 'CloseAccountCommand':
          return await this.handleCloseAccount(command);
        case 'DepositFundsCommand':
          return await this.handleDepositFunds(command);
        case 'WithdrawFundsCommand':
          return await this.handleWithdrawFunds(command);
        case 'TransferFundsCommand':
          return await this.handleTransferFunds(command);
        default:
          throw new Error(`Unknown command type: ${command.constructor.name}`);
      }
    } catch (error) {
      this.logger.error(`Error handling command ${command.constructor.name}:`, error);
      throw error;
    }
  }

  async handleCreateAccount(command) {
    const accountData = {
      id: command.id,
      userId: command.userId,
      accountType: command.accountType,
      currency: command.currency,
      balance: command.initialBalance,
      accountName: command.accountName,
      description: command.description,
      status: 'active',
      metadata: command.metadata,
      createdAt: command.createdAt || new Date().toISOString(),
      updatedAt: command.createdAt || new Date().toISOString()
    };

    // Write to databases
    await this.dualWriter.writeToAllDatabases(accountData, 'accounts');

    // Publish event
    const event = new AccountCreatedEvent({
      accountId: command.id,
      userId: command.userId,
      accountType: command.accountType,
      currency: command.currency,
      initialBalance: command.initialBalance,
      accountName: command.accountName,
      timestamp: command.createdAt || new Date().toISOString()
    });

    await this.eventStore.saveEvent(event);
    await this.kafkaService.produce('account-events', event);

    this.logger.info('Account created successfully', { accountId: command.id });
    return accountData;
  }

  async handleUpdateAccount(command) {
    const currentAccount = await this.getAccountById(command.accountId);
    if (!currentAccount) {
      throw new Error('Account not found');
    }

    const updates = { ...command.updates, updatedAt: command.updatedAt || new Date().toISOString() };

    // Update in database
    await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const updateFields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
      const values = [...Object.values(updates), command.accountId];
      await connection.execute(
        `UPDATE accounts SET ${updateFields} WHERE id = ?`,
        values
      );
    });

    // Publish event
    const event = new AccountUpdatedEvent({
      accountId: command.accountId,
      updates: command.updates,
      updatedBy: command.updatedBy,
      timestamp: command.updatedAt || new Date().toISOString()
    });

    await this.eventStore.saveEvent(event);
    await this.kafkaService.produce('account-events', event);

    this.logger.info('Account updated successfully', { accountId: command.accountId });
    return { ...currentAccount, ...updates };
  }

  async handleSuspendAccount(command) {
    const currentAccount = await this.getAccountById(command.accountId);
    if (!currentAccount) {
      throw new Error('Account not found');
    }

    if (currentAccount.status === 'suspended') {
      throw new Error('Account is already suspended');
    }

    const updates = {
      status: 'suspended',
      suspendedAt: command.suspendedAt || new Date().toISOString(),
      updatedAt: command.suspendedAt || new Date().toISOString()
    };

    await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      await connection.execute(
        'UPDATE accounts SET status = ?, suspended_at = ?, updated_at = ? WHERE id = ?',
        [updates.status, updates.suspendedAt, updates.updatedAt, command.accountId]
      );
    });

    // Publish event
    const event = new AccountSuspendedEvent({
      accountId: command.accountId,
      reason: command.reason,
      suspendedBy: command.suspendedBy,
      timestamp: command.suspendedAt || new Date().toISOString()
    });

    await this.eventStore.saveEvent(event);
    await this.kafkaService.produce('account-events', event);

    this.logger.info('Account suspended successfully', { accountId: command.accountId });
    return { ...currentAccount, ...updates };
  }

  async handleActivateAccount(command) {
    const currentAccount = await this.getAccountById(command.accountId);
    if (!currentAccount) {
      throw new Error('Account not found');
    }

    if (currentAccount.status === 'active') {
      throw new Error('Account is already active');
    }

    const updates = {
      status: 'active',
      activatedAt: command.activatedAt || new Date().toISOString(),
      suspendedAt: null,
      updatedAt: command.activatedAt || new Date().toISOString()
    };

    await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      await connection.execute(
        'UPDATE accounts SET status = ?, activated_at = ?, suspended_at = ?, updated_at = ? WHERE id = ?',
        [updates.status, updates.activatedAt, updates.suspendedAt, updates.updatedAt, command.accountId]
      );
    });

    // Publish event
    const event = new AccountActivatedEvent({
      accountId: command.accountId,
      activatedBy: command.activatedBy,
      timestamp: command.activatedAt || new Date().toISOString()
    });

    await this.eventStore.saveEvent(event);
    await this.kafkaService.produce('account-events', event);

    this.logger.info('Account activated successfully', { accountId: command.accountId });
    return { ...currentAccount, ...updates };
  }

  async handleCloseAccount(command) {
    const currentAccount = await this.getAccountById(command.accountId);
    if (!currentAccount) {
      throw new Error('Account not found');
    }

    if (currentAccount.status === 'closed') {
      throw new Error('Account is already closed');
    }

    if (currentAccount.balance > 0) {
      throw new Error('Cannot close account with positive balance');
    }

    const updates = {
      status: 'closed',
      closedAt: command.closedAt || new Date().toISOString(),
      updatedAt: command.closedAt || new Date().toISOString()
    };

    await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      await connection.execute(
        'UPDATE accounts SET status = ?, closed_at = ?, updated_at = ? WHERE id = ?',
        [updates.status, updates.closedAt, updates.updatedAt, command.accountId]
      );
    });

    // Publish event
    const event = new AccountClosedEvent({
      accountId: command.accountId,
      reason: command.reason,
      closedBy: command.closedBy,
      finalBalance: currentAccount.balance,
      timestamp: command.closedAt || new Date().toISOString()
    });

    await this.eventStore.saveEvent(event);
    await this.kafkaService.produce('account-events', event);

    this.logger.info('Account closed successfully', { accountId: command.accountId });
    return { ...currentAccount, ...updates };
  }

  async handleDepositFunds(command) {
    const account = await this.getAccountById(command.accountId);
    if (!account) {
      throw new Error('Account not found');
    }

    if (account.status !== 'active') {
      throw new Error('Account is not active');
    }

    if (account.currency !== command.currency) {
      throw new Error('Currency mismatch');
    }

    const oldBalance = account.balance;
    const newBalance = oldBalance + command.amount;

    // Update balance
    await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      await connection.execute(
        'UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?',
        [newBalance, command.depositedAt || new Date().toISOString(), command.accountId]
      );
    });

    // Record transaction
    const transactionId = require('uuid').v4();
    const transactionData = {
      id: transactionId,
      accountId: command.accountId,
      type: 'deposit',
      amount: command.amount,
      currency: command.currency,
      description: command.description,
      reference: command.reference,
      status: 'completed',
      createdBy: command.depositedBy,
      createdAt: command.depositedAt || new Date().toISOString()
    };

    await this.dualWriter.writeToAllDatabases(transactionData, 'account_transactions');

    // Publish events
    const balanceEvent = new AccountBalanceUpdatedEvent({
      accountId: command.accountId,
      oldBalance,
      newBalance,
      currency: command.currency,
      reason: 'deposit',
      reference: command.reference,
      updatedBy: command.depositedBy,
      timestamp: command.depositedAt || new Date().toISOString()
    });

    const depositEvent = new FundsDepositedEvent({
      accountId: command.accountId,
      amount: command.amount,
      currency: command.currency,
      newBalance,
      description: command.description,
      reference: command.reference,
      depositedBy: command.depositedBy,
      timestamp: command.depositedAt || new Date().toISOString()
    });

    await this.eventStore.saveEvent(balanceEvent);
    await this.eventStore.saveEvent(depositEvent);
    await this.kafkaService.produce('account-events', balanceEvent);
    await this.kafkaService.produce('account-events', depositEvent);

    this.logger.info('Funds deposited successfully', {
      accountId: command.accountId,
      amount: command.amount,
      newBalance
    });

    return { ...account, balance: newBalance, transactionId };
  }

  async handleWithdrawFunds(command) {
    const account = await this.getAccountById(command.accountId);
    if (!account) {
      throw new Error('Account not found');
    }

    if (account.status !== 'active') {
      throw new Error('Account is not active');
    }

    if (account.currency !== command.currency) {
      throw new Error('Currency mismatch');
    }

    if (account.balance < command.amount) {
      throw new Error('Insufficient funds');
    }

    const oldBalance = account.balance;
    const newBalance = oldBalance - command.amount;

    // Update balance
    await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      await connection.execute(
        'UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?',
        [newBalance, command.withdrawnAt || new Date().toISOString(), command.accountId]
      );
    });

    // Record transaction
    const transactionId = require('uuid').v4();
    const transactionData = {
      id: transactionId,
      accountId: command.accountId,
      type: 'withdrawal',
      amount: command.amount,
      currency: command.currency,
      description: command.description,
      reference: command.reference,
      status: 'completed',
      createdBy: command.withdrawnBy,
      createdAt: command.withdrawnAt || new Date().toISOString()
    };

    await this.dualWriter.writeToAllDatabases(transactionData, 'account_transactions');

    // Publish events
    const balanceEvent = new AccountBalanceUpdatedEvent({
      accountId: command.accountId,
      oldBalance,
      newBalance,
      currency: command.currency,
      reason: 'withdrawal',
      reference: command.reference,
      updatedBy: command.withdrawnBy,
      timestamp: command.withdrawnAt || new Date().toISOString()
    });

    const withdrawalEvent = new FundsWithdrawnEvent({
      accountId: command.accountId,
      amount: command.amount,
      currency: command.currency,
      newBalance,
      description: command.description,
      reference: command.reference,
      withdrawnBy: command.withdrawnBy,
      timestamp: command.withdrawnAt || new Date().toISOString()
    });

    await this.eventStore.saveEvent(balanceEvent);
    await this.eventStore.saveEvent(withdrawalEvent);
    await this.kafkaService.produce('account-events', balanceEvent);
    await this.kafkaService.produce('account-events', withdrawalEvent);

    this.logger.info('Funds withdrawn successfully', {
      accountId: command.accountId,
      amount: command.amount,
      newBalance
    });

    return { ...account, balance: newBalance, transactionId };
  }

  async handleTransferFunds(command) {
    // Get both accounts
    const [fromAccount, toAccount] = await Promise.all([
      this.getAccountById(command.fromAccountId),
      this.getAccountById(command.toAccountId)
    ]);

    if (!fromAccount || !toAccount) {
      throw new Error('One or both accounts not found');
    }

    if (fromAccount.status !== 'active' || toAccount.status !== 'active') {
      throw new Error('Both accounts must be active');
    }

    if (fromAccount.currency !== command.currency || toAccount.currency !== command.currency) {
      throw new Error('Currency mismatch');
    }

    if (fromAccount.balance < command.amount) {
      throw new Error('Insufficient funds in source account');
    }

    const transferId = require('uuid').v4();
    const timestamp = command.transferredAt || new Date().toISOString();

    // Update balances
    const fromNewBalance = fromAccount.balance - command.amount;
    const toNewBalance = toAccount.balance + command.amount;

    await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      // Update from account
      await connection.execute(
        'UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?',
        [fromNewBalance, timestamp, command.fromAccountId]
      );

      // Update to account
      await connection.execute(
        'UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?',
        [toNewBalance, timestamp, command.toAccountId]
      );
    });

    // Record transactions
    const fromTransaction = {
      id: require('uuid').v4(),
      accountId: command.fromAccountId,
      type: 'transfer',
      amount: -command.amount, // Negative for outgoing
      currency: command.currency,
      description: command.description,
      reference: command.reference,
      transferId,
      status: 'completed',
      createdBy: command.transferredBy,
      createdAt: timestamp
    };

    const toTransaction = {
      id: require('uuid').v4(),
      accountId: command.toAccountId,
      type: 'transfer',
      amount: command.amount, // Positive for incoming
      currency: command.currency,
      description: command.description,
      reference: command.reference,
      transferId,
      status: 'completed',
      createdBy: command.transferredBy,
      createdAt: timestamp
    };

    await Promise.all([
      this.dualWriter.writeToAllDatabases(fromTransaction, 'account_transactions'),
      this.dualWriter.writeToAllDatabases(toTransaction, 'account_transactions')
    ]);

    // Publish events
    const transferEvent = new FundsTransferredEvent({
      transferId,
      fromAccountId: command.fromAccountId,
      toAccountId: command.toAccountId,
      amount: command.amount,
      currency: command.currency,
      fromAccountNewBalance: fromNewBalance,
      toAccountNewBalance: toNewBalance,
      description: command.description,
      reference: command.reference,
      transferredBy: command.transferredBy,
      timestamp
    });

    const fromBalanceEvent = new AccountBalanceUpdatedEvent({
      accountId: command.fromAccountId,
      oldBalance: fromAccount.balance,
      newBalance: fromNewBalance,
      currency: command.currency,
      reason: 'transfer_out',
      reference: command.reference,
      updatedBy: command.transferredBy,
      timestamp
    });

    const toBalanceEvent = new AccountBalanceUpdatedEvent({
      accountId: command.toAccountId,
      oldBalance: toAccount.balance,
      newBalance: toNewBalance,
      currency: command.currency,
      reason: 'transfer_in',
      reference: command.reference,
      updatedBy: command.transferredBy,
      timestamp
    });

    await Promise.all([
      this.eventStore.saveEvent(transferEvent),
      this.eventStore.saveEvent(fromBalanceEvent),
      this.eventStore.saveEvent(toBalanceEvent),
      this.kafkaService.produce('account-events', transferEvent),
      this.kafkaService.produce('account-events', fromBalanceEvent),
      this.kafkaService.produce('account-events', toBalanceEvent)
    ]);

    this.logger.info('Funds transferred successfully', {
      transferId,
      fromAccountId: command.fromAccountId,
      toAccountId: command.toAccountId,
      amount: command.amount
    });

    return {
      transferId,
      fromAccount: { ...fromAccount, balance: fromNewBalance },
      toAccount: { ...toAccount, balance: toNewBalance }
    };
  }

  async getAccountById(accountId) {
    const result = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute('SELECT * FROM accounts WHERE id = ?', [accountId]);
      return rows[0];
    });
    return result;
  }
}