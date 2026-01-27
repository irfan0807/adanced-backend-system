export class PaymentInitiatedEvent {
  constructor(data) {
    this.eventType = 'PaymentInitiated';
    this.aggregateId = data.paymentId;
    this.paymentId = data.paymentId;
    this.customerId = data.customerId;
    this.amount = data.amount;
    this.currency = data.currency;
    this.paymentMethod = data.paymentMethod;
    this.description = data.description;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp;
    this.version = 1;
  }
}

export class PaymentProcessingEvent {
  constructor(data) {
    this.eventType = 'PaymentProcessing';
    this.aggregateId = data.paymentId;
    this.paymentId = data.paymentId;
    this.gatewayTransactionId = data.gatewayTransactionId;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp;
    this.version = 1;
  }
}

export class PaymentCompletedEvent {
  constructor(data) {
    this.eventType = 'PaymentCompleted';
    this.aggregateId = data.paymentId;
    this.paymentId = data.paymentId;
    this.gatewayTransactionId = data.gatewayTransactionId;
    this.amount = data.amount;
    this.currency = data.currency;
    this.fee = data.fee || 0;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp;
    this.version = 1;
  }
}

export class PaymentFailedEvent {
  constructor(data) {
    this.eventType = 'PaymentFailed';
    this.aggregateId = data.paymentId;
    this.paymentId = data.paymentId;
    this.failureReason = data.failureReason;
    this.gatewayResponse = data.gatewayResponse;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp;
    this.version = 1;
  }
}

export class PaymentRefundedEvent {
  constructor(data) {
    this.eventType = 'PaymentRefunded';
    this.aggregateId = data.paymentId;
    this.paymentId = data.paymentId;
    this.refundId = data.refundId;
    this.refundAmount = data.refundAmount;
    this.reason = data.reason;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp;
    this.version = 1;
  }
}

export class PaymentMethodAddedEvent {
  constructor(data) {
    this.eventType = 'PaymentMethodAdded';
    this.aggregateId = data.paymentMethodId;
    this.paymentMethodId = data.paymentMethodId;
    this.customerId = data.customerId;
    this.type = data.type;
    this.isDefault = data.isDefault;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp;
    this.version = 1;
  }
}

export class SubscriptionCreatedEvent {
  constructor(data) {
    this.eventType = 'SubscriptionCreated';
    this.aggregateId = data.subscriptionId;
    this.subscriptionId = data.subscriptionId;
    this.customerId = data.customerId;
    this.amount = data.amount;
    this.currency = data.currency;
    this.interval = data.interval;
    this.intervalCount = data.intervalCount;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp;
    this.version = 1;
  }
}

export class SubscriptionPaymentEvent {
  constructor(data) {
    this.eventType = 'SubscriptionPayment';
    this.aggregateId = data.subscriptionId;
    this.subscriptionId = data.subscriptionId;
    this.paymentId = data.paymentId;
    this.amount = data.amount;
    this.currency = data.currency;
    this.status = data.status; // success, failed
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp;
    this.version = 1;
  }
}

export class FraudAlertEvent {
  constructor(data) {
    this.eventType = 'FraudAlert';
    this.aggregateId = data.paymentId;
    this.paymentId = data.paymentId;
    this.customerId = data.customerId;
    this.riskScore = data.riskScore;
    this.riskFactors = data.riskFactors || [];
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp;
    this.version = 1;
  }
}

export class PaymentDisputedEvent {
  constructor(data) {
    this.eventType = 'PaymentDisputed';
    this.aggregateId = data.paymentId;
    this.paymentId = data.paymentId;
    this.disputeId = data.disputeId;
    this.reason = data.reason;
    this.amount = data.amount;
    this.status = data.status; // opened, won, lost
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp;
    this.version = 1;
  }
}

export class WebhookReceivedEvent {
  constructor(data) {
    this.eventType = 'WebhookReceived';
    this.aggregateId = data.webhookId;
    this.webhookId = data.webhookId;
    this.provider = data.provider; // stripe, paypal, etc.
    this.eventType = data.eventType; // Provider's event type
    this.paymentId = data.paymentId;
    this.data = data.data; // Raw webhook data
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp;
    this.version = 1;
  }
}