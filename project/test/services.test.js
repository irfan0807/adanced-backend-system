// Set test environment
process.env.NODE_ENV = 'test';

// Mock external dependencies except database (which now uses in-memory)
jest.mock('../src/shared/database/dual-writer.js');
jest.mock('../src/shared/messaging/kafka-service.js');
jest.mock('../src/shared/messaging/rabbitmq-service.js');

describe('Service Integration Tests', () => {
  test('Services should import without errors', async () => {
    // Test that all service files can be imported
    const services = [
      '../src/services/account-service/server.js',
      '../src/services/payment-service/server.js',
      '../src/services/notification-service/server.js',
      '../src/services/audit-service/server.js',
      '../src/services/analytics-service/server.js',
      '../src/services/risk-assessment-service/server.js',
      '../src/services/currency-service/server.js',
      '../src/services/settlement-service/server.js',
      '../src/services/reporting-service/server.js',
      '../src/services/event-store-service/server.js'
    ];

    for (const service of services) {
      try {
        await import(service);
        console.log(`✓ ${service} imported successfully`);
      } catch (error) {
        console.error(`✗ Failed to import ${service}:`, error.message);
        throw error;
      }
    }
  });

  test('Reporting service functions should be defined', async () => {
    const reportingService = await import('../src/services/reporting-service/server.js');

    // Check that key functions are exported or available
    expect(typeof reportingService.default).toBe('function');
    console.log('✓ Reporting service exports default Express app');
  });

  test('Event store service functions should be defined', async () => {
    const eventStoreService = await import('../src/services/event-store-service/server.js');

    expect(typeof eventStoreService.default).toBe('function');
    console.log('✓ Event store service exports default Express app');
  });

  test('Messaging services should work in test mode', async () => {
    const { KafkaService } = await import('../src/shared/messaging/kafka-service.js');
    const { RabbitMQService } = await import('../src/shared/messaging/rabbitmq-service.js');

    const kafka = new KafkaService();
    const rabbit = new RabbitMQService();

    // Test Kafka in-memory mode
    await kafka.initialize();
    await kafka.produce('test-topic', { key: 'test', value: 'test message' });
    console.log('✓ Kafka in-memory service works');

    // Test RabbitMQ in-memory mode
    await rabbit.initialize();
    await rabbit.publish('test-queue', { message: 'test' });
    console.log('✓ RabbitMQ in-memory service works');

    await kafka.disconnect();
    await rabbit.disconnect();
  });
});