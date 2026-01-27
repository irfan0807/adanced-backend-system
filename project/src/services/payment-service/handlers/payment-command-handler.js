import { v4 as uuidv4 } from 'uuid';
import {
  ProcessPaymentCommand,
  CapturePaymentCommand,
  RefundPaymentCommand,
  UpdatePaymentStatusCommand,
  AddPaymentMethodCommand,
  CreateSubscriptionCommand
} from '../commands/payment-commands.js';
import {
  PaymentInitiatedEvent,
  PaymentProcessingEvent,
  PaymentCompletedEvent,
  PaymentFailedEvent,
  PaymentRefundedEvent,
  PaymentMethodAddedEvent,
  SubscriptionCreatedEvent,
  FraudAlertEvent
} from '../events/payment-events.js';
import RetryWithBackoff from '../../../shared/patterns/retry-with-backoff.js';

export class PaymentCommandHandler {
  constructor(dependencies) {
    this.connectionPool = dependencies.connectionPool;
    this.dualWriter = dependencies.dualWriter;
    this.eventStore = dependencies.eventStore;
    this.kafkaService = dependencies.kafkaService;
    this.logger = dependencies.logger;

    this.retryLogic = new RetryWithBackoff({
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000
    });

    // Initialize payment gateways
    this.stripeGateway = new StripeGateway(process.env.STRIPE_SECRET_KEY);
    this.paypalGateway = new PayPalGateway({
      clientId: process.env.PAYPAL_CLIENT_ID,
      clientSecret: process.env.PAYPAL_CLIENT_SECRET
    });
  }

  async handle(command) {
    if (command instanceof ProcessPaymentCommand) {
      return await this.handleProcessPayment(command);
    } else if (command instanceof CapturePaymentCommand) {
      return await this.handleCapturePayment(command);
    } else if (command instanceof RefundPaymentCommand) {
      return await this.handleRefundPayment(command);
    } else if (command instanceof UpdatePaymentStatusCommand) {
      return await this.handleUpdatePaymentStatus(command);
    } else if (command instanceof AddPaymentMethodCommand) {
      return await this.handleAddPaymentMethod(command);
    } else if (command instanceof CreateSubscriptionCommand) {
      return await this.handleCreateSubscription(command);
    } else {
      throw new Error(`Unknown command type: ${command.constructor.name}`);
    }
  }

  async handleProcessPayment(command) {
    try {
      command.validate();

      // Fraud detection check
      const fraudCheck = await this.performFraudCheck(command);
      if (fraudCheck.riskScore > 80) {
        await this.publishFraudAlert(command.id, fraudCheck);
        throw new Error('Payment blocked due to fraud risk');
      }

      // Create payment record
      const paymentData = {
        id: command.id,
        customerId: command.customerId,
        amount: command.amount,
        currency: command.currency,
        paymentMethod: command.paymentMethod,
        paymentMethodId: command.paymentMethodId,
        description: command.description,
        status: 'pending',
        capture: command.capture,
        metadata: command.metadata,
        createdAt: command.createdAt || new Date().toISOString(),
        updatedAt: command.createdAt || new Date().toISOString()
      };

      // Write to databases
      await this.dualWriter.writeToAllDatabases(paymentData);

      // Store event
      const event = new PaymentInitiatedEvent({
        paymentId: command.id,
        customerId: command.customerId,
        amount: command.amount,
        currency: command.currency,
        paymentMethod: command.paymentMethod,
        description: command.description,
        timestamp: new Date().toISOString()
      });

      await this.eventStore.append(event);

      // Publish event
      await this.kafkaService.produce('payment-events', {
        key: command.id,
        value: JSON.stringify(event)
      });

      // Process payment asynchronously
      setImmediate(() => this.processPaymentAsync(paymentData));

      this.logger.info('Payment initiated successfully', {
        paymentId: command.id,
        customerId: command.customerId,
        amount: command.amount
      });

      return {
        success: true,
        paymentId: command.id,
        data: paymentData
      };

    } catch (error) {
      this.logger.error('Failed to process payment', {
        paymentId: command.id,
        error: error.message
      });
      throw error;
    }
  }

  async handleCapturePayment(command) {
    try {
      command.validate();

      const payment = await this.getPaymentById(command.paymentId);
      if (!payment) {
        throw new Error('Payment not found');
      }

      if (payment.status !== 'authorized') {
        throw new Error('Payment must be authorized to capture');
      }

      const captureAmount = command.amount || payment.amount;

      // Process capture with gateway
      const gatewayResponse = await this.captureWithGateway(payment, captureAmount);

      // Update payment status
      const updateCommand = new UpdatePaymentStatusCommand({
        paymentId: command.paymentId,
        status: 'completed',
        gatewayResponse,
        updatedAt: new Date().toISOString()
      });

      return await this.handleUpdatePaymentStatus(updateCommand);

    } catch (error) {
      this.logger.error('Failed to capture payment', {
        paymentId: command.paymentId,
        error: error.message
      });
      throw error;
    }
  }

  async handleRefundPayment(command) {
    try {
      command.validate();

      const payment = await this.getPaymentById(command.paymentId);
      if (!payment) {
        throw new Error('Payment not found');
      }

      if (!['completed', 'partially_refunded'].includes(payment.status)) {
        throw new Error('Payment must be completed to refund');
      }

      // Check refund amount
      const existingRefunds = await this.getPaymentRefunds(command.paymentId);
      const totalRefunded = existingRefunds.reduce((sum, refund) =>
        refund.status === 'completed' ? sum + refund.amount : sum, 0);

      if (totalRefunded + command.amount > payment.amount) {
        throw new Error('Total refund amount cannot exceed payment amount');
      }

      // Create refund record
      const refundData = {
        id: command.refundId,
        paymentId: command.paymentId,
        amount: command.amount,
        reason: command.reason,
        status: 'pending',
        metadata: command.metadata,
        createdAt: command.createdAt || new Date().toISOString(),
        updatedAt: command.createdAt || new Date().toISOString()
      };

      await this.dualWriter.writeToAllDatabases(refundData, { tableName: 'refunds' });

      // Process refund asynchronously
      setImmediate(() => this.processRefundAsync(refundData, payment));

      this.logger.info('Refund initiated successfully', {
        refundId: command.refundId,
        paymentId: command.paymentId,
        amount: command.amount
      });

      return {
        success: true,
        refundId: command.refundId,
        data: refundData
      };

    } catch (error) {
      this.logger.error('Failed to process refund', {
        refundId: command.refundId,
        error: error.message
      });
      throw error;
    }
  }

  async handleUpdatePaymentStatus(command) {
    try {
      command.validate();

      const payment = await this.getPaymentById(command.paymentId);
      if (!payment) {
        throw new Error('Payment not found');
      }

      const updatedData = {
        ...payment,
        status: command.status,
        failureReason: command.failureReason,
        gatewayResponse: command.gatewayResponse,
        updatedAt: command.updatedAt || new Date().toISOString()
      };

      // Update databases
      await this.dualWriter.writeToAllDatabases(updatedData);

      // Store appropriate event
      let event;
      switch (command.status) {
        case 'processing':
          event = new PaymentProcessingEvent({
            paymentId: command.paymentId,
            gatewayTransactionId: command.gatewayResponse?.transactionId,
            timestamp: new Date().toISOString()
          });
          break;
        case 'completed':
          event = new PaymentCompletedEvent({
            paymentId: command.paymentId,
            gatewayTransactionId: command.gatewayResponse?.transactionId,
            amount: payment.amount,
            currency: payment.currency,
            fee: command.gatewayResponse?.fee || 0,
            timestamp: new Date().toISOString()
          });
          break;
        case 'failed':
          event = new PaymentFailedEvent({
            paymentId: command.paymentId,
            failureReason: command.failureReason,
            gatewayResponse: command.gatewayResponse,
            timestamp: new Date().toISOString()
          });
          break;
      }

      if (event) {
        await this.eventStore.append(event);
        await this.kafkaService.produce('payment-events', {
          key: command.paymentId,
          value: JSON.stringify(event)
        });
      }

      this.logger.info('Payment status updated', {
        paymentId: command.paymentId,
        oldStatus: payment.status,
        newStatus: command.status
      });

      return {
        success: true,
        paymentId: command.paymentId,
        data: updatedData
      };

    } catch (error) {
      this.logger.error('Failed to update payment status', {
        paymentId: command.paymentId,
        error: error.message
      });
      throw error;
    }
  }

  async handleAddPaymentMethod(command) {
    try {
      command.validate();

      // Tokenize payment method with gateway
      const tokenizedMethod = await this.tokenizePaymentMethod(command);

      const methodData = {
        id: command.id,
        customerId: command.customerId,
        type: command.type,
        token: tokenizedMethod.token,
        gatewayId: tokenizedMethod.gatewayId,
        last4: tokenizedMethod.last4,
        brand: tokenizedMethod.brand,
        expiryMonth: tokenizedMethod.expiryMonth,
        expiryYear: tokenizedMethod.expiryYear,
        isDefault: command.isDefault,
        active: true,
        metadata: command.metadata,
        createdAt: command.createdAt || new Date().toISOString(),
        updatedAt: command.createdAt || new Date().toISOString()
      };

      await this.dualWriter.writeToAllDatabases(methodData, { tableName: 'payment_methods' });

      // Store event
      const event = new PaymentMethodAddedEvent({
        paymentMethodId: command.id,
        customerId: command.customerId,
        type: command.type,
        isDefault: command.isDefault,
        timestamp: new Date().toISOString()
      });

      await this.eventStore.append(event);

      await this.kafkaService.produce('payment-events', {
        key: command.id,
        value: JSON.stringify(event)
      });

      this.logger.info('Payment method added successfully', {
        paymentMethodId: command.id,
        customerId: command.customerId,
        type: command.type
      });

      return {
        success: true,
        paymentMethodId: command.id,
        data: methodData
      };

    } catch (error) {
      this.logger.error('Failed to add payment method', {
        paymentMethodId: command.id,
        error: error.message
      });
      throw error;
    }
  }

  async handleCreateSubscription(command) {
    try {
      command.validate();

      const subscriptionData = {
        id: command.id,
        customerId: command.customerId,
        paymentMethodId: command.paymentMethodId,
        amount: command.amount,
        currency: command.currency,
        interval: command.interval,
        intervalCount: command.intervalCount,
        description: command.description,
        status: 'active',
        currentPeriodStart: command.startDate || new Date().toISOString(),
        currentPeriodEnd: this.calculateNextBillingDate(command.startDate || new Date(), command.interval, command.intervalCount),
        metadata: command.metadata,
        createdAt: command.createdAt || new Date().toISOString(),
        updatedAt: command.createdAt || new Date().toISOString()
      };

      await this.dualWriter.writeToAllDatabases(subscriptionData, { tableName: 'subscriptions' });

      // Store event
      const event = new SubscriptionCreatedEvent({
        subscriptionId: command.id,
        customerId: command.customerId,
        amount: command.amount,
        currency: command.currency,
        interval: command.interval,
        intervalCount: command.intervalCount,
        timestamp: new Date().toISOString()
      });

      await this.eventStore.append(event);

      await this.kafkaService.produce('payment-events', {
        key: command.id,
        value: JSON.stringify(event)
      });

      this.logger.info('Subscription created successfully', {
        subscriptionId: command.id,
        customerId: command.customerId,
        amount: command.amount
      });

      return {
        success: true,
        subscriptionId: command.id,
        data: subscriptionData
      };

    } catch (error) {
      this.logger.error('Failed to create subscription', {
        subscriptionId: command.id,
        error: error.message
      });
      throw error;
    }
  }

  // Helper methods
  async getPaymentById(paymentId) {
    const mysqlResult = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT * FROM payments WHERE id = ?',
        [paymentId]
      );
      return rows[0];
    });

    if (mysqlResult) return mysqlResult;

    const mongoDB = this.connectionPool.getMongoDatabase();
    return await mongoDB.collection('payments').findOne({ id: paymentId });
  }

  async getPaymentRefunds(paymentId) {
    const mysqlResult = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT * FROM refunds WHERE payment_id = ?',
        [paymentId]
      );
      return rows;
    });

    if (mysqlResult) return mysqlResult;

    const mongoDB = this.connectionPool.getMongoDatabase();
    return await mongoDB.collection('refunds').find({ paymentId }).toArray();
  }

  async performFraudCheck(command) {
    // Implement fraud detection logic
    // This would integrate with services like Sift, Riskified, etc.
    const riskScore = Math.floor(Math.random() * 100); // Mock implementation
    const riskFactors = [];

    if (command.amount > 10000) riskFactors.push('high_amount');
    if (command.metadata?.suspiciousLocation) riskFactors.push('suspicious_location');

    return { riskScore, riskFactors };
  }

  async publishFraudAlert(paymentId, fraudCheck) {
    const event = new FraudAlertEvent({
      paymentId,
      customerId: 'unknown', // Would get from payment data
      riskScore: fraudCheck.riskScore,
      riskFactors: fraudCheck.riskFactors,
      timestamp: new Date().toISOString()
    });

    await this.eventStore.append(event);
    await this.kafkaService.produce('payment-events', {
      key: paymentId,
      value: JSON.stringify(event)
    });
  }

  async processPaymentAsync(payment) {
    try {
      await this.processPaymentWithGateway(payment);
    } catch (error) {
      this.logger.error('Async payment processing failed', {
        paymentId: payment.id,
        error: error.message
      });
    }
  }

  async processPaymentWithGateway(payment) {
    // Update status to processing
    await this.handleUpdatePaymentStatus(new UpdatePaymentStatusCommand({
      paymentId: payment.id,
      status: 'processing',
      updatedAt: new Date().toISOString()
    }));

    try {
      // Route to appropriate gateway
      let gatewayResponse;
      switch (payment.paymentMethod) {
        case 'credit_card':
        case 'debit_card':
          gatewayResponse = await this.stripeGateway.processPayment(payment);
          break;
        case 'paypal':
          gatewayResponse = await this.paypalGateway.processPayment(payment);
          break;
        default:
          throw new Error(`Unsupported payment method: ${payment.paymentMethod}`);
      }

      // Update to completed
      await this.handleUpdatePaymentStatus(new UpdatePaymentStatusCommand({
        paymentId: payment.id,
        status: 'completed',
        gatewayResponse,
        updatedAt: new Date().toISOString()
      }));

    } catch (error) {
      // Update to failed
      await this.handleUpdatePaymentStatus(new UpdatePaymentStatusCommand({
        paymentId: payment.id,
        status: 'failed',
        failureReason: error.message,
        updatedAt: new Date().toISOString()
      }));
    }
  }

  async processRefundAsync(refund, payment) {
    try {
      // Process refund with gateway
      const gatewayResponse = await this.processRefundWithGateway(refund, payment);

      // Update refund status
      await this.updateRefundStatus(refund.id, 'completed');

      // Update payment status if fully refunded
      const allRefunds = await this.getPaymentRefunds(payment.id);
      const totalRefunded = allRefunds
        .filter(r => r.status === 'completed')
        .reduce((sum, r) => sum + r.amount, 0);

      let newPaymentStatus = 'partially_refunded';
      if (totalRefunded >= payment.amount) {
        newPaymentStatus = 'refunded';
      }

      await this.handleUpdatePaymentStatus(new UpdatePaymentStatusCommand({
        paymentId: payment.id,
        status: newPaymentStatus,
        updatedAt: new Date().toISOString()
      }));

      // Publish refund event
      const event = new PaymentRefundedEvent({
        paymentId: payment.id,
        refundId: refund.id,
        refundAmount: refund.amount,
        reason: refund.reason,
        timestamp: new Date().toISOString()
      });

      await this.eventStore.append(event);
      await this.kafkaService.produce('payment-events', {
        key: payment.id,
        value: JSON.stringify(event)
      });

    } catch (error) {
      await this.updateRefundStatus(refund.id, 'failed');
      this.logger.error('Refund processing failed', {
        refundId: refund.id,
        error: error.message
      });
    }
  }

  async updateRefundStatus(refundId, status) {
    await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      await connection.execute(
        'UPDATE refunds SET status = ?, processed_at = NOW() WHERE id = ?',
        [status, refundId]
      );
    });

    const mongoDB = this.connectionPool.getMongoDatabase();
    await mongoDB.collection('refunds').updateOne(
      { id: refundId },
      {
        $set: {
          status: status,
          processedAt: new Date()
        }
      }
    );
  }

  calculateNextBillingDate(startDate, interval, count) {
    const date = new Date(startDate);
    switch (interval) {
      case 'day':
        date.setDate(date.getDate() + count);
        break;
      case 'week':
        date.setDate(date.getDate() + (count * 7));
        break;
      case 'month':
        date.setMonth(date.getMonth() + count);
        break;
      case 'year':
        date.setFullYear(date.getFullYear() + count);
        break;
    }
    return date.toISOString();
  }

  // Placeholder methods for gateway integrations
  async captureWithGateway(payment, amount) {
    // Implement actual gateway capture logic
    return { transactionId: `cap_${Date.now()}`, fee: 0 };
  }

  async processRefundWithGateway(refund, payment) {
    // Implement actual gateway refund logic
    return { transactionId: `ref_${Date.now()}` };
  }

  async tokenizePaymentMethod(command) {
    // Implement actual tokenization logic
    return {
      token: `tok_${Date.now()}`,
      gatewayId: `pm_${Date.now()}`,
      last4: '4242',
      brand: 'visa',
      expiryMonth: 12,
      expiryYear: 2025
    };
  }
}

// Placeholder gateway classes
class StripeGateway {
  constructor(secretKey) {
    this.secretKey = secretKey;
  }

  async processPayment(payment) {
    // Implement Stripe payment processing
    return { transactionId: `stripe_${Date.now()}`, fee: payment.amount * 0.029 };
  }
}

class PayPalGateway {
  constructor(config) {
    this.config = config;
  }

  async processPayment(payment) {
    // Implement PayPal payment processing
    return { transactionId: `paypal_${Date.now()}`, fee: payment.amount * 0.034 };
  }
}