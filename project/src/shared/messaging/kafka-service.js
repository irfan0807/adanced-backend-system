import { Kafka } from 'kafkajs';

class InMemoryKafkaService {
  constructor() {
    this.topics = new Map();
    this.consumers = new Map();
    this.messages = new Map();
    this.admin = {
      listTopics: async () => Array.from(this.topics.keys()),
      createTopics: async ({ topics }) => {
        topics.forEach(topic => {
          if (!this.topics.has(topic.topic)) {
            this.topics.set(topic.topic, {
              partitions: topic.numPartitions || 1,
              messages: []
            });
          }
        });
      },
      disconnect: async () => {}
    };
  }

  async initialize() {
    // Create default topics
    const topics = [
      'database-events',
      'failed-writes',
      'compensation-events',
      'transaction-events',
      'user-events',
      'payment-events',
      'notification-events',
      'audit-events'
    ];

    for (const topic of topics) {
      if (!this.topics.has(topic)) {
        this.topics.set(topic, {
          partitions: 3,
          messages: []
        });
      }
    }
  }

  async createTopics() {
    // Topics are created in initialize for in-memory
  }

  async produce(topic, message) {
    if (!this.topics.has(topic)) {
      await this.initialize();
    }

    const topicData = this.topics.get(topic);
    topicData.messages.push({
      ...message,
      offset: topicData.messages.length,
      timestamp: Date.now()
    });

    // Trigger any consumers for this topic
    const topicConsumers = this.consumers.get(topic) || [];
    for (const consumer of topicConsumers) {
      if (consumer.handler) {
        await consumer.handler({
          topic,
          partition: 0,
          offset: topicData.messages.length - 1,
          key: message.key,
          value: message.value,
          headers: message.headers,
          timestamp: Date.now()
        });
      }
    }

    return { success: true };
  }

  async createConsumer(groupId) {
    return {
      groupId,
      connect: async () => {},
      subscribe: async ({ topics }) => {
        const topicList = Array.isArray(topics) ? topics : [topics];
        topicList.forEach(topic => {
          if (!this.consumers.has(topic)) {
            this.consumers.set(topic, []);
          }
          this.consumers.get(topic).push({ groupId });
        });
      },
      run: async ({ eachMessage }) => {
        // Store handler for later use
        const topicList = Array.isArray(this.consumers.keys()) ? Array.from(this.consumers.keys()) : [this.consumers.keys()];
        topicList.forEach(topic => {
          const consumers = this.consumers.get(topic) || [];
          consumers.forEach(consumer => {
            if (consumer.groupId === groupId) {
              consumer.handler = eachMessage;
            }
          });
        });
      },
      disconnect: async () => {}
    };
  }

  async consumeMessages(topics, groupId, messageHandler) {
    const consumer = await this.createConsumer(groupId);
    await consumer.subscribe({ topics });
    await consumer.run({ eachMessage: messageHandler });
    return consumer;
  }

  async disconnect() {
    // No-op for in-memory
  }
}

export class KafkaService {
  constructor() {
    this.isTest = process.env.NODE_ENV === 'test';

    if (this.isTest) {
      this.service = new InMemoryKafkaService();
    } else {
      this.kafka = new Kafka({
        clientId: 'transaction-system',
        brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(',')
      });

      this.producer = null;
      this.consumer = null;
      this.admin = null;
    }
  }

  async initialize() {
    if (this.isTest) {
      return await this.service.initialize();
    }

    this.producer = this.kafka.producer({
      maxInFlightRequests: 1,
      idempotent: true,
      transactionTimeout: 30000,
    });

    this.admin = this.kafka.admin();

    await this.producer.connect();
    await this.admin.connect();

    // Create topics if they don't exist
    await this.createTopics();
  }

  async createTopics() {
    if (this.isTest) {
      return await this.service.createTopics();
    }

    const topics = [
      'database-events',
      'failed-writes',
      'compensation-events',
      'transaction-events',
      'user-events',
      'payment-events',
      'notification-events',
      'audit-events'
    ];

    const existingTopics = await this.admin.listTopics();
    const topicsToCreate = topics
      .filter(topic => !existingTopics.includes(topic))
      .map(topic => ({
        topic,
        numPartitions: 3,
        replicationFactor: 1,
        configEntries: [
          { name: 'cleanup.policy', value: 'delete' },
          { name: 'retention.ms', value: '604800000' } // 7 days
        ]
      }));

    if (topicsToCreate.length > 0) {
      await this.admin.createTopics({
        topics: topicsToCreate
      });
    }
  }

  async produce(topic, message) {
    if (this.isTest) {
      return await this.service.produce(topic, message);
    }

    if (!this.producer) {
      await this.initialize();
    }

    return await this.producer.send({
      topic,
      messages: [message]
    });
  }

  async createConsumer(groupId) {
    if (this.isTest) {
      return await this.service.createConsumer(groupId);
    }

    const consumer = this.kafka.consumer({
      groupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });

    await consumer.connect();
    return consumer;
  }

  async consumeMessages(topics, groupId, messageHandler) {
    if (this.isTest) {
      return await this.service.consumeMessages(topics, groupId, messageHandler);
    }

    const consumer = await this.createConsumer(groupId);

    await consumer.subscribe({
      topics: Array.isArray(topics) ? topics : [topics],
      fromBeginning: false
    });

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          await messageHandler({
            topic,
            partition,
            offset: message.offset,
            key: message.key?.toString(),
            value: message.value?.toString(),
            headers: message.headers,
            timestamp: message.timestamp
          });
        } catch (error) {
          console.error('Error processing message:', error);
          // Implement dead letter queue logic here
        }
      },
    });

    return consumer;
  }

  async disconnect() {
    if (this.isTest) {
      return await this.service.disconnect();
    }

    if (this.producer) {
      await this.producer.disconnect();
    }
    if (this.consumer) {
      await this.consumer.disconnect();
    }
    if (this.admin) {
      await this.admin.disconnect();
    }
  }
}