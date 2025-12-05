import { v4 as uuidv4 } from 'uuid';
import RetryWithBackoff from '../../shared/patterns/retry-with-backoff.js';
import { CreateTransactionCommand, UpdateTransactionStatusCommand } from './commands/transaction-commands.js';
import { GetTransactionQuery, GetTransactionsQuery } from './queries/transaction-queries.js';
import { TransactionCommandHandler } from './handlers/transaction-command-handler.js';
import { TransactionQueryHandler } from './handlers/transaction-query-handler.js';
import { TransactionCreatedEvent, TransactionStatusUpdatedEvent } from './events/transaction-events.js';

export class TransactionService {
  constructor(dependencies) {
    this.connectionPool = dependencies.connectionPool;
    this.dualWriter = dependencies.dualWriter;
    this.eventStore = dependencies.eventStore;
    this.commandBus = dependencies.commandBus;
    this.queryBus = dependencies.queryBus;
    this.kafkaService = dependencies.kafkaService;
    this.logger = dependencies.logger;
    
    this.retryLogic = new RetryWithBackoff({
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000
    });
  }

  async initialize() {
    // Register command handlers
    const commandHandler = new TransactionCommandHandler({
      connectionPool: this.connectionPool,
      dualWriter: this.dualWriter,
      eventStore: this.eventStore,
      kafkaService: this.kafkaService
    });

    this.commandBus.registerHandler('CreateTransactionCommand', commandHandler);
    this.commandBus.registerHandler('UpdateTransactionStatusCommand', commandHandler);

    // Register query handlers
    const queryHandler = new TransactionQueryHandler({
      connectionPool: this.connectionPool
    });

    this.queryBus.registerHandler('GetTransactionQuery', queryHandler);
    this.queryBus.registerHandler('GetTransactionsQuery', queryHandler);

    // Setup event handlers
    await this.setupEventHandlers();

    this.logger.info('Transaction Service initialized');
  }

  async createTransaction(transactionData) {
    const command = new CreateTransactionCommand({
      id: uuidv4(),
      ...transactionData,
      status: 'pending',
      createdAt: new Date().toISOString()
    });

    return await this.retryLogic.execute(async () => {
      return await this.commandBus.execute(command);
    });
  }

  async updateTransactionStatus(transactionId, status) {
    const command = new UpdateTransactionStatusCommand({
      transactionId,
      status,
      updatedAt: new Date().toISOString()
    });

    return await this.retryLogic.execute(async () => {
      return await this.commandBus.execute(command);
    });
  }

  async getTransaction(transactionId) {
    const query = new GetTransactionQuery({ transactionId });
    return await this.queryBus.execute(query);
  }

  async getTransactions(criteria) {
    const query = new GetTransactionsQuery(criteria);
    return await this.queryBus.execute(query);
  }

  async setupEventHandlers() {
    // Listen for external events
    await this.kafkaService.consumeMessages(
      ['payment-events', 'user-events'],
      'transaction-service-group',
      async (message) => {
        try {
          const event = JSON.parse(message.value);
          await this.handleExternalEvent(event);
        } catch (error) {
          this.logger.error('Error handling external event:', error);
        }
      }
    );
  }

  async handleExternalEvent(event) {
    switch (event.eventType) {
      case 'PAYMENT_COMPLETED':
        await this.updateTransactionStatus(event.transactionId, 'completed');
        break;
      case 'PAYMENT_FAILED':
        await this.updateTransactionStatus(event.transactionId, 'failed');
        break;
      case 'USER_SUSPENDED':
        // Handle user suspension logic
        await this.handleUserSuspension(event.userId);
        break;
      default:
        this.logger.info(`Unhandled event type: ${event.eventType}`);
    }
  }

  async handleUserSuspension(userId) {
    // Find all pending transactions for the user and mark them as suspended
    const pendingTransactions = await this.getTransactions({
      userId,
      status: 'pending'
    });

    for (const transaction of pendingTransactions.data) {
      await this.updateTransactionStatus(transaction.id, 'suspended');
    }
  }

  async processTransaction(transactionId) {
    // Complex transaction processing logic with saga pattern
    const transaction = await this.getTransaction(transactionId);
    
    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    // Start saga
    const sagaId = uuidv4();
    const sagaSteps = [
      { service: 'risk', action: 'assess', data: transaction },
      { service: 'account', action: 'debit', data: { accountId: transaction.fromAccount, amount: transaction.amount } },
      { service: 'account', action: 'credit', data: { accountId: transaction.toAccount, amount: transaction.amount } },
      { service: 'payment', action: 'process', data: transaction },
      { service: 'notification', action: 'send', data: { userId: transaction.userId, type: 'transaction_completed' } }
    ];

    // Execute saga steps
    return await this.executeSaga(sagaId, sagaSteps);
  }

  async executeSaga(sagaId, steps) {
    const completedSteps = [];
    
    try {
      for (const step of steps) {
        const result = await this.executeSagaStep(step);
        completedSteps.push({ step, result });
      }
      
      return { success: true, sagaId, completedSteps };
    } catch (error) {
      // Compensate completed steps in reverse order
      await this.compensateSaga(sagaId, completedSteps.reverse());
      throw error;
    }
  }

  async executeSagaStep(step) {
    // This would make HTTP calls to other services through the API gateway
    const response = await fetch(`http://localhost:3000/api/${step.service}/${step.action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(step.data)
    });

    if (!response.ok) {
      throw new Error(`Saga step failed: ${step.service}/${step.action}`);
    }

    return await response.json();
  }

  async compensateSaga(sagaId, completedSteps) {
    this.logger.info(`Compensating saga ${sagaId}`);
    
    for (const { step, result } of completedSteps) {
      try {
        await this.compensateStep(step, result);
      } catch (error) {
        this.logger.error(`Failed to compensate step ${step.service}/${step.action}:`, error);
      }
    }
  }

  async compensateStep(step, result) {
    // Define compensation actions for each step
    const compensationMap = {
      'risk-assess': () => Promise.resolve(), // No compensation needed
      'account-debit': (result) => this.creditAccount(result.accountId, result.amount),
      'account-credit': (result) => this.debitAccount(result.accountId, result.amount),
      'payment-process': (result) => this.refundPayment(result.paymentId),
      'notification-send': () => Promise.resolve() // No compensation needed
    };

    const compensationKey = `${step.service}-${step.action}`;
    const compensationFn = compensationMap[compensationKey];
    
    if (compensationFn) {
      await compensationFn(result);
    }
  }

  async creditAccount(accountId, amount) {
    // Compensation: credit back the debited amount
    await fetch(`http://localhost:3000/api/account/credit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId, amount })
    });
  }

  async debitAccount(accountId, amount) {
    // Compensation: debit back the credited amount
    await fetch(`http://localhost:3000/api/account/debit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId, amount })
    });
  }

  async refundPayment(paymentId) {
    // Compensation: refund the payment
    await fetch(`http://localhost:3000/api/payment/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentId })
    });
  }
}