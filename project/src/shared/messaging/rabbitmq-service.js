import amqp from 'amqplib';

class InMemoryRabbitMQService {
  constructor() {
    this.queues = new Map();
    this.exchanges = new Map();
    this.bindings = new Map();
    this.consumers = new Map();
  }

  async initialize() {
    // Declare default queues
    const queues = [
      'failed-writes-retry',
      'compensation-queue',
      'transaction-queue',
      'user-queue',
      'payment-queue',
      'notification-queue',
      'audit-queue'
    ];

    for (const queue of queues) {
      await this.declareQueue(queue);
    }
  }

  async declareQueues() {
    // Queues are declared in initialize
  }

  async declareQueue(queue, options = {}) {
    if (!this.queues.has(queue)) {
      this.queues.set(queue, {
        messages: [],
        consumers: []
      });
    }
    return { queue };
  }

  async publish(queue, message, options = {}) {
    if (!this.queues.has(queue)) {
      await this.declareQueue(queue);
    }

    const queueData = this.queues.get(queue);
    const msg = {
      content: Buffer.from(JSON.stringify(message)),
      properties: options,
      fields: {
        deliveryTag: Date.now(),
        redelivered: false,
        exchange: '',
        routingKey: queue
      }
    };

    queueData.messages.push(msg);

    // Trigger consumers
    for (const consumer of queueData.consumers) {
      if (consumer.handler) {
        try {
          await consumer.handler(msg);
        } catch (error) {
          console.error('Error in consumer:', error);
        }
      }
    }

    return true;
  }

  async consume(queue, messageHandler, options = {}) {
    if (!this.queues.has(queue)) {
      await this.declareQueue(queue);
    }

    const consumerTag = `consumer_${Date.now()}_${Math.random()}`;
    const queueData = this.queues.get(queue);

    const consumer = {
      consumerTag,
      handler: messageHandler,
      ack: (msg) => {
        // Remove message from queue
        const index = queueData.messages.indexOf(msg);
        if (index > -1) {
          queueData.messages.splice(index, 1);
        }
      },
      nack: (msg, multiple, requeue) => {
        if (requeue) {
          // Requeue message
          queueData.messages.push(msg);
        }
      }
    };

    queueData.consumers.push(consumer);

    // Process existing messages
    while (queueData.messages.length > 0) {
      const msg = queueData.messages.shift();
      try {
        await messageHandler(msg, consumer);
        consumer.ack(msg);
      } catch (error) {
        consumer.nack(msg, false, false);
      }
    }

    return { consumerTag };
  }

  async createExchange(exchangeName, type = 'direct', options = {}) {
    if (!this.exchanges.has(exchangeName)) {
      this.exchanges.set(exchangeName, {
        type,
        bindings: new Map()
      });
    }
    return { exchange: exchangeName };
  }

  async bindQueue(queue, exchange, routingKey = '') {
    if (!this.exchanges.has(exchange)) {
      await this.createExchange(exchange);
    }

    const exchangeData = this.exchanges.get(exchange);
    if (!exchangeData.bindings.has(queue)) {
      exchangeData.bindings.set(queue, new Set());
    }
    exchangeData.bindings.get(queue).add(routingKey);

    if (!this.bindings.has(queue)) {
      this.bindings.set(queue, new Map());
    }
    this.bindings.get(queue).set(exchange, routingKey);
  }

  async publishToExchange(exchange, routingKey, message, options = {}) {
    if (!this.exchanges.has(exchange)) {
      await this.createExchange(exchange);
    }

    const exchangeData = this.exchanges.get(exchange);

    // Find bound queues
    for (const [queue, routingKeys] of exchangeData.bindings) {
      if (routingKeys.has(routingKey) || routingKeys.has('')) {
        await this.publish(queue, message, options);
      }
    }
  }

  async disconnect() {
    // Clear all data
    this.queues.clear();
    this.exchanges.clear();
    this.bindings.clear();
    this.consumers.clear();
  }
}

export class RabbitMQService {
  constructor() {
    this.isTest = process.env.NODE_ENV === 'test';

    if (this.isTest) {
      this.service = new InMemoryRabbitMQService();
    } else {
      this.connection = null;
      this.channel = null;
      this.url = process.env.RABBITMQ_URL || 'amqp://localhost';
      this.queues = new Set();
    }
  }

  async initialize() {
    if (this.isTest) {
      return await this.service.initialize();
    }

    try {
      this.connection = await amqp.connect(this.url);
      this.channel = await this.connection.createChannel();

      // Declare queues
      await this.declareQueues();
    } catch (error) {
      console.error('Failed to initialize RabbitMQ:', error);
      throw error;
    }
  }

  async declareQueues() {
    if (this.isTest) {
      return await this.service.declareQueues();
    }

    const queues = [
      'failed-writes-retry',
      'compensation-queue',
      'transaction-queue',
      'user-queue',
      'payment-queue',
      'notification-queue',
      'audit-queue'
    ];

    for (const queue of queues) {
      await this.channel.assertQueue(queue, { durable: true });
      this.queues.add(queue);
    }
  }

  async publish(queue, message, options = {}) {
    if (this.isTest) {
      return await this.service.publish(queue, message, options);
    }

    if (!this.channel) {
      await this.initialize();
    }

    const messageBuffer = Buffer.from(JSON.stringify(message));

    return await this.channel.sendToQueue(queue, messageBuffer, {
      persistent: true,
      ...options
    });
  }

  async consume(queue, messageHandler, options = {}) {
    if (this.isTest) {
      return await this.service.consume(queue, messageHandler, options);
    }

    if (!this.channel) {
      await this.initialize();
    }

    await this.channel.consume(queue, async (msg) => {
      if (msg) {
        try {
          const content = JSON.parse(msg.content.toString());
          await messageHandler(content, msg);
          this.channel.ack(msg);
        } catch (error) {
          console.error('Error processing message:', error);
          this.channel.nack(msg, false, false); // Don't requeue
        }
      }
    }, {
      noAck: false,
      ...options
    });
  }

  async createExchange(exchangeName, type = 'direct', options = {}) {
    if (this.isTest) {
      return await this.service.createExchange(exchangeName, type, options);
    }

    if (!this.channel) {
      await this.initialize();
    }

    return await this.channel.assertExchange(exchangeName, type, {
      durable: true,
      ...options
    });
  }

  async bindQueue(queue, exchange, routingKey = '') {
    if (this.isTest) {
      return await this.service.bindQueue(queue, exchange, routingKey);
    }

    if (!this.channel) {
      await this.initialize();
    }

    return await this.channel.bindQueue(queue, exchange, routingKey);
  }

  async publishToExchange(exchange, routingKey, message, options = {}) {
    if (this.isTest) {
      return await this.service.publishToExchange(exchange, routingKey, message, options);
    }

    if (!this.channel) {
      await this.initialize();
    }

    const messageBuffer = Buffer.from(JSON.stringify(message));

    return await this.channel.publish(exchange, routingKey, messageBuffer, {
      persistent: true,
      ...options
    });
  }

  async disconnect() {
    if (this.isTest) {
      return await this.service.disconnect();
    }

    if (this.channel) {
      await this.channel.close();
    }
    if (this.connection) {
      await this.connection.close();
    }
  }
}