# Advanced Transaction Microservices System - Complete Documentation

## Table of Contents
1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Shared Components](#shared-components)
4. [Services](#services)
5. [API Gateway](#api-gateway)
6. [Data Flow](#data-flow)
7. [CQRS Pattern Implementation](#cqrs-pattern-implementation)
8. [Event Sourcing](#event-sourcing)
9. [Database Strategy](#database-strategy)
10. [Messaging Infrastructure](#messaging-infrastructure)
11. [Resilience Patterns](#resilience-patterns)
12. [Security](#security)
13. [Deployment](#deployment)
14. [Monitoring and Observability](#monitoring-and-observability)

## System Overview

This is a comprehensive microservices-based transaction processing system built with Node.js, implementing CQRS (Command Query Responsibility Segregation), Event Sourcing, and various resilience patterns. The system supports high-volume financial transactions with multiple database writes, circuit breakers, rate limiting, and distributed messaging.

### Key Features
- **CQRS Architecture**: Separate command and query handling for optimal performance
- **Event Sourcing**: Complete audit trail and state reconstruction
- **Dual Database Writes**: MySQL (primary), MongoDB (secondary), Google Spanner (future)
- **Distributed Messaging**: Kafka for event streaming, RabbitMQ for message queuing
- **Resilience Patterns**: Circuit breakers, retry logic, bulkhead pattern, rate limiting
- **Microservices**: 12+ services with independent scaling and deployment

## Architecture

### High-Level Architecture
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   API Gateway   │────│  Service Mesh   │────│   Services      │
│                 │    │                 │    │                 │
│ - Rate Limiting │    │ - Circuit       │    │ - Transaction   │
│ - Load Balancing│    │   Breakers      │    │ - User          │
│ - Authentication│    │ - Bulkhead      │    │ - Payment       │
│ - Authorization │    │ - Retry Logic   │    │ - Settlement    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                        │
┌─────────────────┐    ┌─────────────────┐             │
│   Databases     │    │   Messaging     │             │
│                 │    │                 │             │
│ - MySQL         │    │ - Kafka         │◄────────────┘
│ - MongoDB       │    │ - RabbitMQ      │
│ - Google Spanner│    │                 │
└─────────────────┘    └─────────────────┘
```

### Service Architecture
Each service follows CQRS pattern with:
- **Commands**: Write operations that change state
- **Events**: Immutable records of state changes
- **Queries**: Read operations for data retrieval
- **Handlers**: Business logic for commands and queries

## Shared Components

### CQRS Implementation

#### Command Bus (`src/shared/cqrs/command-bus.js`)
```javascript
class CommandBus extends EventEmitter {
  constructor() {
    super();
    this.handlers = new Map();
    this.middlewares = [];
  }

  registerHandler(commandType, handler) {
    this.handlers.set(commandType, handler);
  }

  async execute(command) {
    // Apply middlewares
    for (const middleware of this.middlewares) {
      await middleware(command);
    }

    const handler = this.handlers.get(command.constructor.name);
    if (!handler) {
      throw new Error(`No handler registered for ${command.constructor.name}`);
    }

    return await handler.handle(command);
  }
}
```

#### Query Bus (`src/shared/cqrs/query-bus.js`)
```javascript
class QueryBus extends EventEmitter {
  constructor() {
    super();
    this.handlers = new Map();
    this.middlewares = [];
  }

  registerHandler(queryType, handler) {
    this.handlers.set(queryType, handler);
  }

  async execute(query) {
    // Apply middlewares
    for (const middleware of this.middlewares) {
      await middleware(query);
    }

    const handler = this.handlers.get(query.constructor.name);
    if (!handler) {
      throw new Error(`No handler registered for ${query.constructor.name}`);
    }

    return await handler.handle(query);
  }
}
```

### Database Layer

#### Connection Pool (`src/shared/database/connection-pool.js`)
Manages connections to MySQL and MongoDB with health checks and fallback mechanisms.

```javascript
class DatabaseConnectionPool {
  constructor() {
    this.mysqlPool = null;
    this.mongoClient = null;
    this.isTest = process.env.NODE_ENV === 'test';
  }

  async initialize() {
    if (this.isTest) {
      // Use in-memory implementations for testing
      return;
    }

    // Initialize MySQL connection pool
    this.mysqlPool = mysql.createPool({
      host: process.env.MYSQL_HOST,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      connectionLimit: 10
    });

    // Initialize MongoDB client
    this.mongoClient = new MongoClient(process.env.MONGODB_URI);
    await this.mongoClient.connect();
  }

  getMySQLPool() {
    return this.mysqlPool;
  }

  getMongoDatabase() {
    return this.mongoClient.db(process.env.MONGODB_DATABASE);
  }
}
```

#### Dual Writer (`src/shared/database/dual-writer.js`)
Implements multi-database writes with circuit breakers and compensation logic.

```javascript
class DualDatabaseWriter {
  constructor(connectionPool) {
    this.connectionPool = connectionPool;
    this.circuitBreakers = {
      mysql: new CircuitBreaker(),
      mongodb: new CircuitBreaker(),
      spanner: new CircuitBreaker()
    };
  }

  async writeToAllDatabases(data, options = {}) {
    const results = {
      mysql: null,
      mongodb: null,
      spanner: null,
      overall: 'partial'
    };

    // Write to MySQL (primary)
    try {
      if (this.circuitBreakers.mysql.getState().state !== 'OPEN') {
        results.mysql = await this.writeToMySQL(data);
        this.circuitBreakers.mysql.onSuccess();
      }
    } catch (error) {
      this.circuitBreakers.mysql.onFailure();
      results.mysql = { error: error.message };
    }

    // Write to MongoDB (secondary)
    try {
      if (this.circuitBreakers.mongodb.getState().state !== 'OPEN') {
        results.mongodb = await this.writeToMongoDB(data);
        this.circuitBreakers.mongodb.onSuccess();
      }
    } catch (error) {
      this.circuitBreakers.mongodb.onFailure();
      results.mongodb = { error: error.message };
    }

    // Determine overall result
    if (results.mysql && !results.mysql.error && 
        results.mongodb && !results.mongodb.error) {
      results.overall = 'success';
    } else if (!results.mysql || results.mysql.error) {
      results.overall = 'failed';
    }

    return results;
  }
}
```

### Event Sourcing

#### Event Store (`src/shared/event-sourcing/event-store.js`)
Manages event storage and retrieval with snapshot support.

```javascript
class EventStore {
  constructor(connectionPool, kafkaService) {
    this.connectionPool = connectionPool;
    this.kafkaService = kafkaService;
    this.snapshots = new Map();
  }

  async append(event) {
    const eventData = {
      id: uuidv4(),
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      data: event,
      timestamp: new Date().toISOString(),
      version: event.version || 1
    };

    // Store in database
    const db = this.connectionPool.getMongoDatabase();
    await db.collection('events').insertOne(eventData);

    // Publish to Kafka
    await this.kafkaService.produce('database-events', {
      key: event.aggregateId,
      value: JSON.stringify(eventData)
    });

    return eventData;
  }

  async getEventsForAggregate(aggregateId, fromVersion = 0) {
    const db = this.connectionPool.getMongoDatabase();
    const events = await db.collection('events')
      .find({ 
        aggregateId,
        version: { $gt: fromVersion }
      })
      .sort({ version: 1 })
      .toArray();

    return events;
  }

  async createSnapshot(aggregateId, state, version) {
    const snapshot = {
      aggregateId,
      state,
      version,
      timestamp: new Date().toISOString()
    };

    const db = this.connectionPool.getMongoDatabase();
    await db.collection('snapshots').insertOne(snapshot);
    this.snapshots.set(aggregateId, snapshot);

    return snapshot;
  }
}
```

### Messaging Infrastructure

#### Kafka Service (`src/shared/messaging/kafka-service.js`)
Provides both real Kafka integration and in-memory implementation for testing.

```javascript
export class KafkaService {
  constructor() {
    this.isTest = process.env.NODE_ENV === 'test';
    
    if (this.isTest) {
      this.service = new InMemoryKafkaService();
    } else {
      this.kafka = new Kafka({
        clientId: 'transaction-service',
        brokers: process.env.KAFKA_BROKERS?.split(',') || ['localhost:9092']
      });
      this.producer = null;
      this.admin = null;
    }
  }

  async initialize() {
    if (this.isTest) {
      return await this.service.initialize();
    }

    this.admin = this.kafka.admin();
    await this.producer.connect();
    await this.admin.connect();
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
        replicationFactor: 1
      }));

    if (topicsToCreate.length > 0) {
      await this.admin.createTopics({ topics: topicsToCreate });
    }
  }

  async produce(topic, message) {
    return await this.producer.send({
      topic,
      messages: [message]
    });
  }

  async consumeMessages(topics, groupId, messageHandler) {
    const consumer = await this.createConsumer(groupId);
    await consumer.subscribe({ topics: Array.isArray(topics) ? topics : [topics] });

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
        }
      },
    });

    return consumer;
  }
}
```

#### RabbitMQ Service (`src/shared/messaging/rabbitmq-service.js`)
Provides message queuing with both real RabbitMQ and in-memory implementations.

### Resilience Patterns

#### Circuit Breaker (`src/shared/patterns/circuit-breaker.js`)
Implements circuit breaker pattern with configurable thresholds.

```javascript
class CircuitBreaker extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      timeout: options.timeout || 60000,
      errorThreshold: options.errorThreshold || 50,
      resetTimeout: options.resetTimeout || 30000,
      monitoringPeriod: options.monitoringPeriod || 10000,
      ...options
    };

    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.requestCount = 0;
    this.nextAttempt = Date.now();
  }

  async execute(operation) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is OPEN');
      }
      this.state = 'HALF_OPEN';
    }

    try {
      const result = await Promise.race([
        operation(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Operation timeout')), this.options.timeout)
        )
      ]);

      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.successCount++;
    this.requestCount++;

    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      this.failureCount = 0;
      this.emit('close');
    }
  }

  onFailure() {
    this.failureCount++;
    this.requestCount++;

    const failureRate = (this.failureCount / this.requestCount) * 100;

    if (this.state === 'HALF_OPEN' || failureRate >= this.options.errorThreshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.options.resetTimeout;
      this.emit('open');
    }
  }
}
```

#### Bulkhead Pattern (`src/shared/patterns/bulkhead.js`)
Limits concurrent operations to prevent resource exhaustion.

```javascript
class Bulkhead {
  constructor(options = {}) {
    this.pools = new Map();
    this.defaultPoolSize = options.defaultPoolSize || 10;
    this.queueTimeout = options.queueTimeout || 30000;
  }

  async execute(poolName, operation, options = {}) {
    const pool = this.pools.get(poolName) || this.createPool(poolName);
    const timeout = options.timeout || this.queueTimeout;

    pool.stats.totalRequests++;

    return new Promise((resolve, reject) => {
      const task = {
        operation,
        resolve,
        reject,
        timestamp: Date.now(),
        timeout: setTimeout(() => {
          this.removeFromQueue(pool, task);
          pool.stats.rejectedRequests++;
          reject(new Error(`Bulkhead timeout for pool ${poolName}`));
        }, timeout)
      };

      if (pool.active < pool.size) {
        this.executeTask(pool, task);
      } else {
        pool.queue.push(task);
        pool.stats.queuedRequests++;
      }
    });
  }
}
```

#### Rate Limiter (`src/shared/patterns/rate-limiter.js`)
Implements sliding window rate limiting using Redis.

#### Retry with Backoff (`src/shared/patterns/retry-with-backoff.js`)
Implements exponential backoff retry logic with jitter.

## Services

### Transaction Service

#### Architecture
The Transaction Service implements CQRS with the following structure:
```
transaction-service/
├── server.js              # Express server with routes
├── transaction-service.js # Main service class
├── commands/              # Write operations
│   ├── transaction-commands.js
├── events/                # Domain events
│   └── transaction-events.js
├── handlers/              # Command and query handlers
│   ├── transaction-command-handler.js
│   └── transaction-query-handler.js
└── queries/               # Read operations
    └── transaction-queries.js
```

#### Key Features
- **Saga Pattern**: Complex transaction processing with compensation
- **Event-Driven**: Publishes events to Kafka for cross-service communication
- **Dual Writes**: Ensures data consistency across databases
- **Retry Logic**: Automatic retry with exponential backoff

#### API Endpoints
```javascript
POST /transactions          # Create transaction
GET  /transactions/:id      # Get transaction by ID
PUT  /transactions/:id/status # Update transaction status
GET  /transactions          # List transactions with filters
GET  /health               # Health check
GET  /metrics              # Service metrics
```

#### Commands
- `CreateTransactionCommand`: Creates new transactions
- `UpdateTransactionStatusCommand`: Updates transaction status
- `CancelTransactionCommand`: Cancels pending transactions

#### Events
- `TransactionCreatedEvent`: Fired when transaction is created
- `TransactionStatusUpdatedEvent`: Fired when status changes
- `TransactionCancelledEvent`: Fired when transaction is cancelled

### User Service

#### Architecture
Complete user management with authentication, authorization, and comprehensive CQRS implementation.

#### Key Features
- **JWT Authentication**: Token-based authentication with refresh
- **Role-Based Access Control**: Granular permissions system
- **Audit Trail**: Complete user activity tracking
- **Bulk Operations**: Mass user updates and migrations
- **Security Features**: Password hashing, session management

#### API Endpoints
```javascript
POST /register              # User registration
POST /login                 # User authentication
GET  /profile               # Get user profile
PUT  /profile               # Update user profile
GET  /health               # Health check
```

#### Commands (15 total)
- `CreateUserCommand`
- `UpdateUserCommand`
- `ChangeUserPasswordCommand`
- `SuspendUserCommand`
- `ActivateUserCommand`
- `DeleteUserCommand`
- `UpdateUserPreferencesCommand`
- `VerifyUserEmailCommand`
- `ResetUserPasswordCommand`
- `UpdateUserProfileCommand`
- `AddUserRoleCommand`
- `RemoveUserRoleCommand`
- `UpdateUserSecuritySettingsCommand`
- `RecordUserLoginCommand`
- `RecordUserLogoutCommand`
- `UpdateUserLastActivityCommand`
- `BulkUpdateUsersCommand`
- `MigrateUserDataCommand`

#### Queries (22 total)
- `GetUserQuery`
- `GetUsersQuery`
- `GetUserByEmailQuery`
- `GetUserProfileQuery`
- `GetUserAnalyticsQuery`
- `GetUserActivityQuery`
- `GetUserSecuritySettingsQuery`
- `GetUserPreferencesQuery`
- `GetUsersByRoleQuery`
- `GetUsersByStatusQuery`
- `GetUserLoginHistoryQuery`
- `GetUserAuditTrailQuery`
- `GetUserReportQuery`
- `GetUserStatisticsQuery`
- `GetUserDashboardDataQuery`
- `GetUserActivitySummaryQuery`
- `GetUserEngagementMetricsQuery`
- `GetUserRetentionAnalysisQuery`
- `GetUserChurnAnalysisQuery`
- `GetUserLifecycleReportQuery`
- `GetUserSecurityReportQuery`
- `GetUserComplianceReportQuery`
- `GetUserPerformanceMetricsQuery`
- `GetUserMigrationStatusQuery`
- `GetUserBulkOperationStatusQuery`

### Settlement Service

#### Architecture
Complex settlement processing with scheduling, reconciliation, and reporting.

#### Key Features
- **Scheduled Settlements**: Automated settlement processing
- **Merchant Management**: Multi-merchant settlement support
- **Reconciliation**: Automated discrepancy detection
- **Holds Management**: Settlement holds and releases
- **Reporting**: Comprehensive settlement reports

#### Business Logic
- **Settlement Eligibility**: Checks merchant eligibility based on schedules
- **Amount Calculation**: Calculates net settlement amounts with fees
- **Saga Processing**: Complex multi-step settlement workflows
- **Schedule Management**: Daily, weekly, monthly settlement cycles

## API Gateway

### Features
- **Rate Limiting**: Sliding window rate limiting with Redis
- **Circuit Breakers**: Per-service circuit breaker protection
- **Bulkhead Pattern**: Concurrent request limiting per service
- **Load Balancing**: Proxy middleware with service discovery
- **Security**: Helmet.js security headers, CORS configuration

### Configuration
```javascript
const services = {
  user: `http://localhost:${process.env.USER_SERVICE_PORT || 3001}`,
  account: `http://localhost:${process.env.ACCOUNT_SERVICE_PORT || 3002}`,
  transaction: `http://localhost:${process.env.TRANSACTION_SERVICE_PORT || 3003}`,
  payment: `http://localhost:${process.env.PAYMENT_SERVICE_PORT || 3004}`,
  notification: `http://localhost:${process.env.NOTIFICATION_SERVICE_PORT || 3005}`,
  audit: `http://localhost:${process.env.AUDIT_SERVICE_PORT || 3006}`,
  analytics: `http://localhost:${process.env.ANALYTICS_SERVICE_PORT || 3007}`,
  risk: `http://localhost:${process.env.RISK_SERVICE_PORT || 3008}`,
  currency: `http://localhost:${process.env.CURRENCY_SERVICE_PORT || 3009}`,
  settlement: `http://localhost:${process.env.SETTLEMENT_SERVICE_PORT || 3010}`,
  reporting: `http://localhost:${process.env.REPORTING_SERVICE_PORT || 3011}`,
  eventstore: `http://localhost:${process.env.EVENTSTORE_SERVICE_PORT || 3012}`
};
```

### Endpoints
```javascript
GET  /health               # Gateway health check
GET  /metrics              # Gateway metrics
GET  /api/discovery/services # Service discovery
/api/*                     # Proxied service routes
```

## Data Flow

### Transaction Creation Flow
1. **API Gateway** receives transaction request
2. **Rate Limiting** and **Circuit Breaker** checks
3. **Transaction Service** receives request
4. **Command Bus** routes to `CreateTransactionCommand`
5. **Command Handler** validates and processes command
6. **Dual Writer** writes to MySQL and MongoDB
7. **Event Store** saves `TransactionCreatedEvent`
8. **Kafka** publishes event to `transaction-events` topic
9. **Response** returned to client

### Cross-Service Communication
1. **Service A** publishes event to Kafka
2. **Service B** consumes event via Kafka consumer
3. **Service B** processes event and may create commands
4. **Eventual Consistency** achieved through event-driven architecture

## CQRS Pattern Implementation

### Command Side
- **Commands**: Represent user intent to change state
- **Command Handlers**: Contain business logic for state changes
- **Validation**: Commands are validated before processing
- **Events**: Generated as result of successful command execution

### Query Side
- **Queries**: Represent requests for data
- **Query Handlers**: Retrieve and shape data for presentation
- **Read Models**: Optimized data structures for queries
- **No Side Effects**: Queries never modify state

### Benefits
- **Separation of Concerns**: Write and read operations are separate
- **Scalability**: Command and query sides can scale independently
- **Performance**: Optimized read models for specific query patterns
- **Maintainability**: Clear separation of business logic

## Event Sourcing

### Core Concepts
- **Events**: Immutable records of state changes
- **Event Store**: Persistent storage for events
- **Aggregate**: Cluster of domain objects with defined boundaries
- **Snapshots**: Performance optimization for aggregates with many events

### Implementation
```javascript
// Event structure
{
  id: "uuid",
  aggregateId: "transaction-123",
  eventType: "TransactionCreated",
  data: { ... },
  timestamp: "2024-01-01T00:00:00Z",
  version: 1
}
```

### Benefits
- **Audit Trail**: Complete history of all state changes
- **Temporal Queries**: Query state at any point in time
- **Debugging**: Replay events to understand system behavior
- **Analytics**: Rich data for business intelligence

## Database Strategy

### Multi-Database Architecture
- **MySQL**: Primary database for transactional data
- **MongoDB**: Secondary database for flexible queries and analytics
- **Google Spanner**: Future distributed database for global scale

### Dual Write Pattern
- **Primary Success Required**: MySQL writes must succeed
- **Secondary Best Effort**: MongoDB writes can fail gracefully
- **Compensation**: Failed writes trigger compensation logic
- **Circuit Breakers**: Prevent cascade failures

### Data Consistency
- **Eventual Consistency**: Cross-service consistency via events
- **Saga Pattern**: Complex transaction coordination
- **Compensation**: Rollback mechanisms for failed operations

## Messaging Infrastructure

### Kafka Topics
- `database-events`: Database change events
- `transaction-events`: Transaction lifecycle events
- `user-events`: User management events
- `payment-events`: Payment processing events
- `notification-events`: Notification events
- `audit-events`: Audit trail events

### Message Structure
```javascript
{
  key: "aggregate-id",
  value: JSON.stringify(event),
  headers: {
    "event-type": "TransactionCreated",
    "service": "transaction-service"
  }
}
```

### Consumer Groups
- **transaction-service-group**: Transaction service consumers
- **user-service-group**: User service consumers
- **settlement-service-group**: Settlement service consumers

## Resilience Patterns

### Circuit Breaker States
- **CLOSED**: Normal operation, requests pass through
- **OPEN**: Failure threshold exceeded, requests fail fast
- **HALF_OPEN**: Testing if service recovered

### Bulkhead Configuration
- **Pool Size**: Maximum concurrent requests per service
- **Queue Timeout**: Maximum time to wait in queue
- **Rejection Policy**: What to do when pool is full

### Retry Configuration
- **Max Retries**: Maximum number of retry attempts
- **Base Delay**: Initial delay between retries
- **Exponential Backoff**: Delay multiplier for each retry
- **Jitter**: Randomization to prevent thundering herd

## Security

### Authentication
- **JWT Tokens**: Stateless authentication
- **Refresh Tokens**: Token renewal mechanism
- **Session Management**: Login/logout tracking

### Authorization
- **Role-Based Access Control**: User roles and permissions
- **Service-Level Security**: API gateway authentication
- **Request Validation**: Input sanitization and validation

### Data Protection
- **Password Hashing**: bcrypt for secure password storage
- **Encryption**: Data encryption at rest and in transit
- **Audit Logging**: Comprehensive security event logging

## Deployment

### Environment Variables
```bash
# Database
MYSQL_HOST=localhost
MYSQL_USER=root
MYSQL_PASSWORD=password
MYSQL_DATABASE=transactions
MONGODB_URI=mongodb://localhost:27017
MONGODB_DATABASE=transactions

# Messaging
KAFKA_BROKERS=localhost:9092
RABBITMQ_URL=amqp://localhost

# Services
USER_SERVICE_PORT=3001
TRANSACTION_SERVICE_PORT=3003
SETTLEMENT_SERVICE_PORT=3010
API_GATEWAY_PORT=3000

# Security
JWT_SECRET=your-secret-key
REDIS_HOST=localhost:6379
```

### Docker Compose
```yaml
version: '3.8'
services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: password
      MYSQL_DATABASE: transactions
  
  mongodb:
    image: mongo:5.0
    volumes:
      - mongodb_data:/data/db
  
  kafka:
    image: confluentinc/cp-kafka:7.0.0
    environment:
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
  
  redis:
    image: redis:7.0
  
  api-gateway:
    build: .
    ports:
      - "3000:3000"
    depends_on:
      - mysql
      - mongodb
      - kafka
      - redis
```

## Monitoring and Observability

### Health Checks
- **Service Health**: Individual service health endpoints
- **Dependency Health**: Database, messaging, and external service checks
- **Circuit Breaker Status**: Breaker states and failure rates
- **Bulkhead Metrics**: Pool utilization and queue depths

### Metrics
- **Performance Metrics**: Response times, throughput, error rates
- **Business Metrics**: Transaction volumes, settlement amounts
- **System Metrics**: CPU, memory, disk usage
- **Custom Metrics**: Application-specific KPIs

### Logging
- **Structured Logging**: JSON format with Winston
- **Log Levels**: ERROR, WARN, INFO, DEBUG
- **Centralized Logging**: File and console outputs
- **Correlation IDs**: Request tracing across services

### Alerting
- **Circuit Breaker Alerts**: When breakers open
- **Error Rate Alerts**: When error thresholds exceeded
- **Performance Alerts**: When response times degrade
- **Business Alerts**: When business metrics deviate

## Conclusion

This comprehensive microservices system demonstrates advanced patterns for building scalable, resilient, and maintainable distributed systems. The combination of CQRS, Event Sourcing, and multiple resilience patterns provides a robust foundation for high-volume financial transaction processing.

Key architectural decisions include:
- **CQRS** for optimal read/write performance separation
- **Event Sourcing** for complete audit trails and temporal queries
- **Dual Database Writes** for data consistency and availability
- **Distributed Messaging** for reliable inter-service communication
- **Resilience Patterns** for fault tolerance and graceful degradation

The system is designed to handle the complexities of financial transactions while maintaining high availability, data consistency, and operational observability.