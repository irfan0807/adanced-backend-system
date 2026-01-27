import { CreateTransactionCommand, UpdateTransactionStatusCommand } from '../commands/transaction-commands.js';
import { TransactionCreatedEvent, TransactionStatusUpdatedEvent } from '../events/transaction-events.js';

export class TransactionCommandHandler {
  constructor(dependencies) {
    this.connectionPool = dependencies.connectionPool;
    this.dualWriter = dependencies.dualWriter;
    this.eventStore = dependencies.eventStore;
    this.kafkaService = dependencies.kafkaService;
    this.logger = dependencies.logger;
  }

  async handle(command) {
    if (command instanceof CreateTransactionCommand) {
      return await this.handleCreateTransaction(command);
    } else if (command instanceof UpdateTransactionStatusCommand) {
      return await this.handleUpdateTransactionStatus(command);
    } else {
      throw new Error(`Unknown command type: ${command.constructor.name}`);
    }
  }

  async handleCreateTransaction(command) {
    try {
      // Validate command
      command.validate();

      // Create transaction data
      const transactionData = {
        id: command.id,
        userId: command.userId,
        fromAccount: command.fromAccount,
        toAccount: command.toAccount,
        amount: command.amount,
        currency: command.currency,
        type: command.type,
        description: command.description,
        status: command.status || 'pending',
        metadata: command.metadata,
        createdAt: command.createdAt || new Date().toISOString(),
        updatedAt: command.createdAt || new Date().toISOString()
      };

      // Write to databases using dual writer
      const result = await this.dualWriter.writeToAllDatabases(transactionData, {
        requireAllDatabases: false // Allow partial success for now
      });

      // Store event in event store
      const event = new TransactionCreatedEvent({
        transactionId: command.id,
        userId: command.userId,
        amount: command.amount,
        currency: command.currency,
        type: command.type,
        timestamp: new Date().toISOString()
      });

      await this.eventStore.append(event);

      // Publish event to Kafka
      await this.kafkaService.produce('transaction-events', {
        key: command.id,
        value: JSON.stringify(event)
      });

      this.logger.info('Transaction created successfully', {
        transactionId: command.id,
        userId: command.userId,
        amount: command.amount
      });

      return {
        success: true,
        transactionId: command.id,
        result
      };

    } catch (error) {
      this.logger.error('Failed to create transaction', {
        transactionId: command.id,
        error: error.message
      });
      throw error;
    }
  }

  async handleUpdateTransactionStatus(command) {
    try {
      // Validate command
      command.validate();

      // Update transaction status
      const updateData = {
        id: command.transactionId,
        status: command.status,
        updatedAt: command.updatedAt || new Date().toISOString(),
        metadata: {
          ...command.metadata,
          statusUpdateReason: command.reason
        }
      };

      // Write update to databases
      const result = await this.dualWriter.writeToAllDatabases(updateData, {
        requireAllDatabases: false
      });

      // Store event in event store
      const event = new TransactionStatusUpdatedEvent({
        transactionId: command.transactionId,
        oldStatus: 'unknown', // Would need to fetch from DB in real implementation
        newStatus: command.status,
        reason: command.reason,
        timestamp: new Date().toISOString()
      });

      await this.eventStore.append(event);

      // Publish event to Kafka
      await this.kafkaService.produce('transaction-events', {
        key: command.transactionId,
        value: JSON.stringify(event)
      });

      this.logger.info('Transaction status updated successfully', {
        transactionId: command.transactionId,
        newStatus: command.status
      });

      return {
        success: true,
        transactionId: command.transactionId,
        result
      };

    } catch (error) {
      this.logger.error('Failed to update transaction status', {
        transactionId: command.transactionId,
        error: error.message
      });
      throw error;
    }
  }
}