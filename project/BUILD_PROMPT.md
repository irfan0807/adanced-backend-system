# 🏗️ Complete Prompt: Build Advanced Transaction Microservices System

## Project Overview
Build a production-ready, scalable microservices system for handling financial transactions with enterprise-grade reliability, resilience patterns, and comprehensive monitoring.

---

## 🎯 System Requirements

### Core Objectives
- Handle **10,000+ requests/second** throughput
- Achieve **99.95% uptime** with automatic failure recovery
- Support distributed transactions across multiple services
- Maintain audit trails and compliance requirements
- Implement event sourcing for complete transaction history
- Enable real-time analytics and reporting

### Technology Stack
- **Runtime:** Node.js with ES6 modules
- **API Framework:** Express.js
- **Databases:** MongoDB (NoSQL), MySQL (Relational), Redis (Caching)
- **Message Queue:** Apache Kafka (event streaming)
- **Message Broker:** RabbitMQ/AMQP (async messaging)
- **Logging:** Winston
- **Authentication:** JWT with bcrypt hashing
- **Validation:** Joi schema validation
- **Security:** Helmet.js for HTTP headers
- **Compression:** gzip compression middleware
- **Proxy:** http-proxy-middleware for routing
- **Rate Limiting:** express-rate-limit
- **Connection Pooling:** generic-pool
- **Scheduling:** node-cron for background jobs
- **HTTP Client:** axios for inter-service communication
- **Database Drivers:** mysql2, mongodb
- **Testing:** Jest
- **Environment:** dotenv for configuration

---

## 🏛️ Architecture: 12 Microservices

### 1. **API Gateway** (Port 3000)
- Entry point for all client requests
- Route requests to appropriate microservices
- Apply cross-cutting concerns (authentication, logging, rate limiting)
- Implement circuit breaker pattern
- Handle request/response transformation
- Aggregate responses from multiple services

### 2. **User Service** (Port 3001)
- User registration and authentication
- Profile management
- User verification and KYC (Know Your Customer)
- JWT token management
- User role and permission management

### 3. **Account Service** (Port 3002)
- Account creation and management
- Balance tracking and ledger entries
- Account statement generation
- Account closure and archival
- Multi-currency account support

### 4. **Transaction Service** (Port 3003) - CORE SERVICE
- Transaction creation and validation
- Transaction state management
- CQRS pattern implementation
- Event sourcing for transaction history
- Saga pattern for distributed transactions
- Real-time transaction notifications

### 5. **Payment Service** (Port 3004)
- Payment processing and gateway integration
- Payment method management
- Refund handling
- Payment status tracking
- Reconciliation with banks

### 6. **Notification Service** (Port 3005)
- Email notifications
- SMS alerts
- Push notifications
- Webhook delivery
- Notification history and retry logic
- Template management

### 7. **Audit Service** (Port 3006)
- Comprehensive audit logging
- Compliance tracking
- Change history
- User activity tracking
- Regulatory reporting support

### 8. **Analytics Service** (Port 3007)
- Real-time metrics aggregation
- Transaction analytics
- Revenue reporting
- User behavior analysis
- Custom report generation
- Dashboard data provisioning

### 9. **Risk Service** (Port 3008)
- Fraud detection
- Anomaly detection
- Risk scoring
- Transaction approval/rejection rules
- Blacklist management
- Machine learning integration ready

### 10. **Currency Service** (Port 3009)
- Exchange rate management
- Currency conversion
- Rate caching and updates
- Multi-currency support
- Historical rate tracking

### 11. **Settlement Service** (Port 3010)
- End-of-day settlement
- Batch processing
- Reconciliation
- Fund transfers
- Settlement status tracking

### 12. **Reporting Service** (Port 3011)
- Advanced reporting engine
- Report scheduling
- Export functionality (PDF, Excel, CSV)
- Data aggregation
- Historical data analysis

---

## 🔧 Shared Infrastructure Layer

### CQRS (Command Query Responsibility Segregation)
```
Structure:
├── commands/ (Write operations)
│   └── Handles state changes
├── queries/ (Read operations)
│   └── Retrieves data optimized for queries
└── Event Bus
    └── Synchronizes write and read models
```

**Implementation:**
- Separate command and query models
- Event bus for communication
- Eventual consistency between models
- Independent scaling of read/write
- Different database optimization strategies

### Event Sourcing
```
Architecture:
┌─────────────────────────────────────┐
│     Event Store (Append-only log)   │
│ [Event1] [Event2] [Event3] [Event4] │
└─────────────────────────────────────┘
         ↓ (Replay events)
┌──────────────────────────────────┐
│    Current State Snapshot        │
│ (Reconstructed from events)      │
└──────────────────────────────────┘
```

**Features:**
- Immutable event log
- Complete transaction history
- Event replay capability
- Time travel debugging
- Audit trail compliance
- Recovery mechanism

### Message Queue (Kafka)
```
Configuration:
- Topics: transactions, payments, notifications, events
- Partitions: 3 per topic for scalability
- Replication factor: 2 for reliability
- Retention: 7 days
- Batch size: 16KB
```

**Usage:**
- Event distribution (50,000+ events/second)
- Service decoupling
- Asynchronous processing
- Event replay

### Connection Pool
```
Configuration:
- Max connections: 20 per service
- Min idle connections: 5
- Idle timeout: 30 seconds
- Acquire timeout: 5 seconds
- Validation interval: 15 seconds
```

### Dual Database Writing
```
Pattern:
┌─────────────────────────────────────┐
│    Application Write Operation      │
└──────────┬──────────────┬───────────┘
           │              │
    ┌──────▼──┐    ┌─────▼───┐
    │ MongoDB │    │  MySQL   │
    │ (NoSQL) │    │(Relational)
    └─────────┘    └──────────┘
    
Benefits:
- MongoDB: Flexible schema, events, logs
- MySQL: ACID transactions, reporting
- Fallback capability
- Data redundancy
```

---

## 🛡️ Resilience Patterns

### 1. Circuit Breaker Pattern
```
States:
┌──────────┐   (Failure rate > 50%)   ┌──────┐
│ CLOSED   │ ────────────────────────> │ OPEN │
│(Normal)  │                           │(Stop)│
└──────────┘                           └──┬───┘
     ▲                                    │
     └────────────────────────────────────┘
     (After 30 seconds, try recovery)
            ↓
         ┌────────────┐
         │HALF_OPEN   │
         │(Test mode) │
         └────────────┘

Implementation:
- Monitor failure rate
- Auto-open on threshold
- Automatic recovery attempts
- Request rejection in open state
- Metrics tracking
```

### 2. Rate Limiter Pattern
```
Configuration:
- Limit: 100 requests per 15 minutes per IP
- Algorithm: Token bucket
- Window: Sliding time window
- Overhead: O(log N) operations

Response:
- 429 Too Many Requests when limit exceeded
- Include Retry-After header
- Track metrics per endpoint
```

### 3. Bulkhead Pattern
```
Resource Isolation:
┌─────────────────────────────────────┐
│    API Gateway                       │
├──────────┬──────────┬────────┬───────┤
│ Payment  │ User     │ Trans  │Account│
│Service   │Service   │Service │Service│
│Pool: 15  │Pool: 15  │Pool: 15│Pool: 15
└──────────┴──────────┴────────┴───────┘

Implementation:
- Max 15 concurrent requests per service
- Separate thread pools
- Prevents resource exhaustion
- Isolates failures
```

### 4. Retry with Backoff Pattern
```
Configuration:
- Max retries: 3
- Initial backoff: 100ms
- Max backoff: 10 seconds
- Exponential multiplier: 2
- Jitter: +/- 10%

Logic:
Attempt 1: Fail → Wait 100ms
Attempt 2: Fail → Wait 200ms
Attempt 3: Fail → Wait 400ms
Attempt 4: Fail → Circuit Open
```

### 5. Saga Pattern (Distributed Transactions)
```
Choreography-based Saga:

Client Request
    ↓
[Step 1: Validate Transaction] → Success
    ↓
[Step 2: Debit Account] → Success
    ↓
[Step 3: Process Payment] → Success
    ↓
[Step 4: Credit Recipient] → Success
    ↓
[Step 5: Send Notification] → Success
    ↓
Transaction Complete ✓

On Failure at Step 3:
    ↓
[Compensate Step 2: Credit back debit]
    ↓
[Compensate Step 1: Cancel transaction]
    ↓
Transaction Rolled Back

Implementation:
- Event-driven coordination
- Compensation logic per service
- Timeout handling
- Idempotent operations
```

---

## 📊 Database Design

### MongoDB Collections (Flexible Schema)
```
Collections:
- events (Event sourcing)
- transactions
- users
- accounts
- notifications
- audit_logs
- analytics_events

Indexes:
- Create compound indexes on frequently queried fields
- TTL indexes for log expiration
- Text indexes for search
```

### MySQL Tables (Relational)
```
Tables:
- users (authentication)
- accounts (ledger)
- transactions (transaction records)
- payments (payment history)
- settlements (reconciliation)
- audit_trail (compliance)
- reports (reporting)

Relationships:
- User → Many Accounts
- Account → Many Transactions
- Transaction → Payment
- Transaction → Audit entries
```

### Redis Cache
```
Keys:
- user:{userId}:profile
- account:{accountId}:balance
- exchange_rates:{currency}
- rate_limit:{ip}:{endpoint}
- circuit_breaker:{service}:state
- session:{sessionId}

TTL Strategy:
- Profiles: 24 hours
- Rates: 1 hour
- Cache-aside pattern
```

---

## 🔌 Integration Points

### Inter-Service Communication
```
Synchronous (REST):
- When immediate response needed
- For small data transfers
- When consistency required
- Error handling via circuit breaker

Asynchronous (Kafka/AMQP):
- For event distribution
- Decoupled services
- High throughput
- Best effort delivery
```

### API Gateway Routing
```
Routes:
GET    /api/users/:id           → User Service
POST   /api/accounts            → Account Service
POST   /api/transactions        → Transaction Service
POST   /api/payments            → Payment Service
POST   /api/notifications       → Notification Service
GET    /api/analytics/reports   → Analytics Service
POST   /api/risk/score          → Risk Service
```

---

## 📈 Monitoring & Observability

### Logging Strategy
```
Levels:
- ERROR: System failures
- WARN: Degraded conditions
- INFO: Important events
- DEBUG: Diagnostic information

Format:
{
  "timestamp": "2024-01-01T12:00:00Z",
  "level": "INFO",
  "service": "transaction-service",
  "traceId": "abc123",
  "userId": "user456",
  "message": "Transaction created",
  "metadata": { ... }
}
```

### Metrics to Track
```
- Request count and latency (p50, p95, p99)
- Error rate and types
- Circuit breaker state changes
- Rate limiter rejections
- Queue depth (Kafka, AMQP)
- Database connection pool utilization
- Service availability
- Transaction success rate
```

### Health Checks
```
Endpoints:
GET /health → Basic liveness
GET /readiness → Service readiness
GET /metrics → Prometheus metrics

Include:
- Database connectivity
- External service availability
- Message queue connection
- Disk space
- Memory usage
```

---

## 🚀 Deployment Strategy

### Development
```
Start single instance per service
- Easy debugging
- Fast iteration
- Local testing
```

### Staging
```
Docker containers
- Multiple instances per service
- Load balancing
- Integration testing
```

### Production
```
Kubernetes deployment
- Auto-scaling
- Rolling updates
- Resource limits
- Health checks
- Persistent volumes
```

---

## 🧪 Testing Strategy

### Unit Tests
```
- Individual service logic
- Pattern implementations
- Utility functions
- Jest with mocking
```

### Integration Tests
```
- Service-to-service communication
- Database operations
- Message queue flow
- Transaction flows
```

### Load Tests
```
- 10,000 requests/second throughput
- Circuit breaker behavior under load
- Rate limiter effectiveness
- Resource pool saturation
```

---

## 📋 Implementation Checklist

### Phase 1: Core Infrastructure (Week 1)
- [ ] API Gateway setup
- [ ] Express middleware configuration
- [ ] Error handling framework
- [ ] Logging setup (Winston)
- [ ] Configuration management (dotenv)

### Phase 2: Database Layer (Week 2)
- [ ] MongoDB connection and ODM
- [ ] MySQL connection pool
- [ ] Redis caching layer
- [ ] Schema design and indexing
- [ ] Data migration scripts

### Phase 3: Resilience Patterns (Week 3)
- [ ] Circuit breaker implementation
- [ ] Rate limiter implementation
- [ ] Bulkhead pattern
- [ ] Retry with backoff
- [ ] Timeout handling

### Phase 4: Microservices (Week 4-5)
- [ ] User Service
- [ ] Account Service
- [ ] Transaction Service (with CQRS)
- [ ] Payment Service
- [ ] Notification Service

### Phase 5: Advanced Features (Week 6-7)
- [ ] Event sourcing
- [ ] Saga pattern
- [ ] Kafka integration
- [ ] Audit service
- [ ] Analytics service

### Phase 6: Monitoring & Ops (Week 8)
- [ ] Centralized logging
- [ ] Metrics collection
- [ ] Health checks
- [ ] Alerting rules
- [ ] Documentation

---

## 📝 Key Code Examples

### Circuit Breaker Usage
```javascript
const breaker = new CircuitBreaker(serviceCall, {
  failureThreshold: 50,
  resetTimeout: 30000,
  monitoringPeriod: 60000
});

try {
  await breaker.execute();
} catch (error) {
  // Handle circuit open or service failure
}
```

### Rate Limiter Usage
```javascript
const limiter = new RateLimiter({
  limit: 100,
  window: 15 * 60 * 1000 // 15 minutes
});

app.use('/api', limiter.middleware());
```

### CQRS Pattern Usage
```javascript
// Command
await commandBus.execute(new CreateTransactionCommand(data));

// Query
const transactions = await queryBus.execute(
  new GetUserTransactionsQuery(userId)
);
```

### Saga Pattern Usage
```javascript
const saga = new TransactionSaga();
saga
  .step('validate', validateTransaction)
  .step('debit', debitAccount)
  .step('process', processPayment)
  .step('credit', creditRecipient)
  .compensate('debit', compensateDebit)
  .compensate('process', compensateProcess);

await saga.execute(transaction);
```

---

## 🎯 Performance Targets

| Metric | Target |
|--------|--------|
| Request latency (p95) | < 200ms |
| Request latency (p99) | < 500ms |
| Throughput | 10,000+ req/s |
| Availability | 99.95% |
| Mean time to recovery | < 30 seconds |
| Error rate | < 0.1% |
| Circuit breaker overhead | < 1ms |

---

## 🔐 Security Considerations

- JWT authentication on all endpoints
- bcrypt password hashing
- Input validation with Joi
- SQL injection prevention
- CORS configuration
- Rate limiting per IP/user
- HTTPS enforcement
- Secret management (API keys)
- Audit logging for compliance
- User role-based access control

---

## 📚 Documentation Required

1. Architecture diagrams
2. Service interaction flows
3. Database schema documentation
4. API endpoint specifications
5. Configuration guide
6. Deployment procedures
7. Troubleshooting guide
8. Performance tuning guide
9. Interview preparation materials
10. Code examples and patterns

---

## ✅ Success Criteria

- All 12 services running independently
- Requests routed through API Gateway
- Circuit breaker preventing cascade failures
- Transactions handled via Saga pattern
- Events stored in Event Store
- Kafka processing 50,000+ events/second
- Rate limiter enforcing limits
- Comprehensive audit logging
- Real-time analytics dashboard
- Automated monitoring and alerting
- 99.95% uptime maintained
- Complete documentation
- Ready for production deployment

---

## 🚀 Getting Started

1. Clone the repository
2. Install dependencies: `npm install`
3. Configure environment variables (`.env`)
4. Start individual services: `npm run start:service-name`
5. Or start all services: `npm run dev`
6. Access API Gateway: `http://localhost:3000`
7. Review documentation in `/docs` directory

---

## 📖 Additional Resources

- Microservices Patterns book
- Event Sourcing & CQRS documentation
- Kafka architecture guide
- Circuit Breaker pattern details
- Saga pattern implementation
- Node.js best practices
- Express.js security guide
- Database design principles
