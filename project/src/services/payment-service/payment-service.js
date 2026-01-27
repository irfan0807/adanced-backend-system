import { v4 as uuidv4 } from 'uuid';
import { PaymentCommandHandler } from './handlers/payment-command-handler.js';
import { PaymentQueryHandler } from './handlers/payment-query-handler.js';
import {
  ProcessPaymentCommand,
  CapturePaymentCommand,
  RefundPaymentCommand,
  UpdatePaymentStatusCommand,
  AddPaymentMethodCommand,
  CreateSubscriptionCommand
} from './commands/payment-commands.js';
import {
  GetPaymentQuery,
  GetPaymentsQuery,
  GetPaymentStatisticsQuery,
  GetPaymentMethodsQuery,
  GetSubscriptionsQuery,
  GetRefundsQuery,
  GetDisputesQuery,
  GetFraudAlertsQuery
} from './queries/payment-queries.js';
import { KafkaService } from '../../shared/messaging/kafka-service.js';
import EventStore from '../../shared/event-sourcing/event-store.js';
import CommandBus from '../../shared/cqrs/command-bus.js';
import QueryBus from '../../shared/cqrs/query-bus.js';

export class PaymentService {
  constructor(dependencies) {
    this.connectionPool = dependencies.connectionPool;
    this.dualWriter = dependencies.dualWriter;
    this.eventStore = dependencies.eventStore || new EventStore(dependencies.connectionPool, dependencies.kafkaService);
    this.commandBus = dependencies.commandBus || new CommandBus();
    this.queryBus = dependencies.queryBus || new QueryBus();
    this.kafkaService = dependencies.kafkaService || new KafkaService();
    this.logger = dependencies.logger;

    this.commandHandler = new PaymentCommandHandler({
      connectionPool: this.connectionPool,
      dualWriter: this.dualWriter,
      eventStore: this.eventStore,
      kafkaService: this.kafkaService,
      logger: this.logger
    });

    this.queryHandler = new PaymentQueryHandler({
      connectionPool: this.connectionPool,
      logger: this.logger
    });
  }

  async initialize() {
    // Register command handlers
    this.commandBus.registerHandler('ProcessPaymentCommand', this.commandHandler);
    this.commandBus.registerHandler('CapturePaymentCommand', this.commandHandler);
    this.commandBus.registerHandler('RefundPaymentCommand', this.commandHandler);
    this.commandBus.registerHandler('UpdatePaymentStatusCommand', this.commandHandler);
    this.commandBus.registerHandler('AddPaymentMethodCommand', this.commandHandler);
    this.commandBus.registerHandler('CreateSubscriptionCommand', this.commandHandler);

    // Register query handlers
    this.queryBus.registerHandler('GetPaymentQuery', this.queryHandler);
    this.queryBus.registerHandler('GetPaymentsQuery', this.queryHandler);
    this.queryBus.registerHandler('GetPaymentStatisticsQuery', this.queryHandler);
    this.queryBus.registerHandler('GetPaymentMethodsQuery', this.queryHandler);
    this.queryBus.registerHandler('GetSubscriptionsQuery', this.queryHandler);
    this.queryBus.registerHandler('GetRefundsQuery', this.queryHandler);
    this.queryBus.registerHandler('GetDisputesQuery', this.queryHandler);
    this.queryBus.registerHandler('GetFraudAlertsQuery', this.queryHandler);

    // Setup event handlers for external events
    await this.setupEventHandlers();

    // Setup webhook handlers
    await this.setupWebhookHandlers();

    // Start subscription billing processor
    this.startSubscriptionProcessor();

    this.logger.info('Payment Service initialized');
  }

  async processPayment(paymentData) {
    const command = new ProcessPaymentCommand({
      id: uuidv4(),
      ...paymentData,
      createdAt: new Date().toISOString()
    });

    return await this.commandBus.execute(command);
  }

  async capturePayment(paymentId, amount) {
    const command = new CapturePaymentCommand({
      paymentId,
      amount,
      updatedAt: new Date().toISOString()
    });

    return await this.commandBus.execute(command);
  }

  async refundPayment(paymentId, amount, reason) {
    const command = new RefundPaymentCommand({
      paymentId,
      refundId: uuidv4(),
      amount,
      reason,
      createdAt: new Date().toISOString()
    });

    return await this.commandBus.execute(command);
  }

  async updatePaymentStatus(paymentId, status, options = {}) {
    const command = new UpdatePaymentStatusCommand({
      paymentId,
      status,
      failureReason: options.failureReason,
      gatewayResponse: options.gatewayResponse,
      updatedAt: new Date().toISOString()
    });

    return await this.commandBus.execute(command);
  }

  async addPaymentMethod(paymentMethodData) {
    const command = new AddPaymentMethodCommand({
      id: uuidv4(),
      ...paymentMethodData,
      createdAt: new Date().toISOString()
    });

    return await this.commandBus.execute(command);
  }

  async createSubscription(subscriptionData) {
    const command = new CreateSubscriptionCommand({
      id: uuidv4(),
      ...subscriptionData,
      createdAt: new Date().toISOString()
    });

    return await this.commandBus.execute(command);
  }

  async getPayment(paymentId) {
    const query = new GetPaymentQuery({ paymentId });
    return await this.queryBus.execute(query);
  }

  async getPayments(criteria = {}) {
    const query = new GetPaymentsQuery(criteria);
    return await this.queryBus.execute(query);
  }

  async getPaymentStatistics(criteria = {}) {
    const query = new GetPaymentStatisticsQuery(criteria);
    return await this.queryBus.execute(query);
  }

  async getPaymentMethods(criteria = {}) {
    const query = new GetPaymentMethodsQuery(criteria);
    return await this.queryBus.execute(query);
  }

  async getSubscriptions(criteria = {}) {
    const query = new GetSubscriptionsQuery(criteria);
    return await this.queryBus.execute(query);
  }

  async getRefunds(criteria = {}) {
    const query = new GetRefundsQuery(criteria);
    return await this.queryBus.execute(query);
  }

  async getDisputes(criteria = {}) {
    const query = new GetDisputesQuery(criteria);
    return await this.queryBus.execute(query);
  }

  async getFraudAlerts(criteria = {}) {
    const query = new GetFraudAlertsQuery(criteria);
    return await this.queryBus.execute(query);
  }

  async setupEventHandlers() {
    // Listen for events from other services
    const eventTopics = [
      'transaction-events',
      'user-events',
      'order-events'
    ];

    for (const topic of eventTopics) {
      await this.kafkaService.consumeMessages(
        [topic],
        `payment-service-${topic.replace('-events', '')}`,
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
  }

  async handleExternalEvent(event) {
    // Handle events from other services that might trigger payments
    switch (event.eventType) {
      case 'TransactionCreated':
        await this.handleTransactionCreated(event);
        break;
      case 'OrderPlaced':
        await this.handleOrderPlaced(event);
        break;
      case 'SubscriptionRenewalDue':
        await this.handleSubscriptionRenewal(event);
        break;
      default:
        this.logger.debug('Received unknown event type:', event.eventType);
    }
  }

  async handleTransactionCreated(event) {
    // Automatically process payment for transaction
    const paymentData = {
      customerId: event.eventData.userId,
      amount: event.eventData.amount,
      currency: event.eventData.currency || 'USD',
      paymentMethod: 'credit_card', // Would be determined from user preferences
      description: `Payment for transaction ${event.aggregateId}`,
      metadata: {
        transactionId: event.aggregateId,
        eventId: event.id
      }
    };

    await this.processPayment(paymentData);
  }

  async handleOrderPlaced(event) {
    // Process payment for order
    const paymentData = {
      customerId: event.eventData.customerId,
      amount: event.eventData.totalAmount,
      currency: event.eventData.currency || 'USD',
      paymentMethod: event.eventData.paymentMethod || 'credit_card',
      description: `Payment for order ${event.aggregateId}`,
      metadata: {
        orderId: event.aggregateId,
        eventId: event.id
      }
    };

    await this.processPayment(paymentData);
  }

  async handleSubscriptionRenewal(event) {
    // Process subscription renewal payment
    const subscription = await this.getSubscriptionById(event.aggregateId);
    if (!subscription || subscription.status !== 'active') {
      return;
    }

    const paymentData = {
      customerId: subscription.customerId,
      amount: subscription.amount,
      currency: subscription.currency,
      paymentMethodId: subscription.paymentMethodId,
      description: `Subscription renewal for ${subscription.id}`,
      metadata: {
        subscriptionId: subscription.id,
        eventId: event.id
      }
    };

    const result = await this.processPayment(paymentData);

    if (result.success) {
      // Update subscription period
      await this.updateSubscriptionPeriod(subscription.id);
    }
  }

  async setupWebhookHandlers() {
    // Setup webhook endpoints for payment gateways
    // This would typically be handled by a separate webhook service
    // but for simplicity, we'll set up basic handlers
  }

  startSubscriptionProcessor() {
    // Process subscription renewals every hour
    setInterval(async () => {
      try {
        await this.processDueSubscriptions();
      } catch (error) {
        this.logger.error('Error processing subscription renewals:', error);
      }
    }, 60 * 60 * 1000); // 1 hour
  }

  async processDueSubscriptions() {
    const dueDate = new Date().toISOString();

    // Find subscriptions due for renewal
    const dueSubscriptions = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT * FROM subscriptions WHERE status = ? AND current_period_end <= ?',
        ['active', dueDate]
      );
      return rows;
    });

    for (const subscription of dueSubscriptions) {
      // Trigger renewal event
      await this.kafkaService.produce('payment-events', {
        eventType: 'SubscriptionRenewalDue',
        aggregateId: subscription.id,
        timestamp: new Date().toISOString()
      });
    }
  }

  async getSubscriptionById(subscriptionId) {
    const mysqlResult = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT * FROM subscriptions WHERE id = ?',
        [subscriptionId]
      );
      return rows[0];
    });

    return mysqlResult;
  }

  async updateSubscriptionPeriod(subscriptionId) {
    const subscription = await this.getSubscriptionById(subscriptionId);
    if (!subscription) return;

    const nextEnd = this.calculateNextBillingDate(
      subscription.current_period_end,
      subscription.interval,
      subscription.interval_count
    );

    await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      await connection.execute(
        'UPDATE subscriptions SET current_period_start = ?, current_period_end = ?, updated_at = NOW() WHERE id = ?',
        [subscription.current_period_end, nextEnd, subscriptionId]
      );
    });
  }

  calculateNextBillingDate(currentEnd, interval, count) {
    const date = new Date(currentEnd);
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

  // Currency conversion utility
  async convertCurrency(amount, fromCurrency, toCurrency) {
    // Implement currency conversion logic
    // This would typically use an external service like Open Exchange Rates
    if (fromCurrency === toCurrency) {
      return amount;
    }

    // Mock conversion rates
    const rates = {
      USD: 1,
      EUR: 0.85,
      GBP: 0.73,
      JPY: 110.0,
      CAD: 1.25,
      AUD: 1.35
    };

    const fromRate = rates[fromCurrency] || 1;
    const toRate = rates[toCurrency] || 1;

    return (amount / fromRate) * toRate;
  }

  // PCI compliance utilities
  maskCardNumber(cardNumber) {
    if (!cardNumber || cardNumber.length < 4) return '****';
    return '****-****-****-' + cardNumber.slice(-4);
  }

  validateCardNumber(cardNumber) {
    // Luhn algorithm implementation
    const digits = cardNumber.replace(/\D/g, '').split('').map(Number);
    let sum = 0;
    let shouldDouble = false;

    for (let i = digits.length - 1; i >= 0; i--) {
      let digit = digits[i];
      if (shouldDouble) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      shouldDouble = !shouldDouble;
    }

    return sum % 10 === 0;
  }

  // Webhook handling for payment gateways
  async handleWebhookEvent(gateway, event) {
    try {
      switch (gateway) {
        case 'stripe':
          await this.handleStripeWebhook(event);
          break;
        case 'paypal':
          await this.handlePayPalWebhook(event);
          break;
        default:
          this.logger.warn(`Unknown gateway webhook: ${gateway}`);
      }
    } catch (error) {
      this.logger.error(`Error handling ${gateway} webhook:`, error);
      throw error;
    }
  }

  async handleStripeWebhook(event) {
    // Handle Stripe webhook events
    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.handlePaymentSuccess(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        await this.handlePaymentFailure(event.data.object);
        break;
      case 'charge.dispute.created':
        await this.handleDisputeCreated(event.data.object);
        break;
      case 'invoice.payment_succeeded':
        await this.handleSubscriptionPayment(event.data.object);
        break;
      default:
        this.logger.debug('Unhandled Stripe event type:', event.type);
    }
  }

  async handlePayPalWebhook(event) {
    // Handle PayPal webhook events
    switch (event.event_type) {
      case 'PAYMENT.CAPTURE.COMPLETED':
        await this.handlePaymentSuccess(event.resource);
        break;
      case 'PAYMENT.CAPTURE.DENIED':
        await this.handlePaymentFailure(event.resource);
        break;
      case 'CUSTOMER.DISPUTE.CREATED':
        await this.handleDisputeCreated(event.resource);
        break;
      default:
        this.logger.debug('Unhandled PayPal event type:', event.event_type);
    }
  }

  async handlePaymentSuccess(gatewayPayment) {
    // Update payment status based on gateway response
    const paymentId = this.extractPaymentIdFromGatewayResponse(gatewayPayment);
    if (paymentId) {
      await this.updatePaymentStatus(paymentId, 'completed', {
        gatewayResponse: gatewayPayment
      });
    }
  }

  async handlePaymentFailure(gatewayPayment) {
    // Update payment status and log failure
    const paymentId = this.extractPaymentIdFromGatewayResponse(gatewayPayment);
    if (paymentId) {
      await this.updatePaymentStatus(paymentId, 'failed', {
        failureReason: gatewayPayment.failure_message || 'Gateway payment failed',
        gatewayResponse: gatewayPayment
      });
    }
  }

  async handleDisputeCreated(dispute) {
    // Create dispute record
    const disputeData = {
      id: uuidv4(),
      paymentId: dispute.payment_intent || dispute.payment_id,
      amount: dispute.amount / 100, // Convert from cents
      currency: dispute.currency,
      reason: dispute.reason,
      status: 'open',
      evidence: {},
      createdAt: new Date().toISOString()
    };

    await this.dualWriter.writeToAllDatabases(disputeData, 'disputes');

    // Publish dispute event
    await this.kafkaService.produce('payment-events', {
      eventType: 'DisputeCreated',
      aggregateId: disputeData.id,
      eventData: disputeData,
      timestamp: new Date().toISOString()
    });
  }

  async handleSubscriptionPayment(invoice) {
    // Handle subscription payment success
    const subscriptionId = invoice.subscription;
    if (subscriptionId) {
      // Update subscription billing cycle
      await this.updateSubscriptionBillingCycle(subscriptionId);
    }
  }

  extractPaymentIdFromGatewayResponse(gatewayPayment) {
    // Extract payment ID from gateway response
    // This would depend on how you store the mapping
    return gatewayPayment.metadata?.paymentId || gatewayPayment.id;
  }

  async updateSubscriptionBillingCycle(subscriptionId) {
    // Update subscription's current period
    const subscription = await this.getSubscriptionById(subscriptionId);
    if (!subscription) return;

    const nextPeriodEnd = this.calculateNextBillingDate(
      subscription.current_period_end,
      subscription.interval,
      subscription.interval_count
    );

    await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      await connection.execute(
        `UPDATE subscriptions
         SET current_period_start = ?, current_period_end = ?, updated_at = NOW()
         WHERE id = ?`,
        [subscription.current_period_end, nextPeriodEnd, subscriptionId]
      );
    });
  }
}