import { Kafka } from 'kafkajs';

export class KafkaService {
  constructor() {
    this.kafka = new Kafka({
      clientId: 'transaction-system',
      brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(',')
    });

    this.producer = null;
    this.consumer = null;
    this.admin = null;
  }

  async initialize() {
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
    if (!this.producer) {
      await this.initialize();
    }

    return await this.producer.send({
      topic,
      messages: [message]
    });
  }

  async createConsumer(groupId) {
    const consumer = this.kafka.consumer({ 
      groupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });
    
    await consumer.connect();
    return consumer;
  }

  async consumeMessages(topics, groupId, messageHandler) {
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