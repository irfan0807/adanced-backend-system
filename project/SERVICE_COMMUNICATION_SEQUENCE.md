# Transaction Flow Sequence Diagram

## Typical Transaction Processing Flow

```
Client Application
       │
       ▼
   API Gateway (3000)
       │ [Authenticate & Route]
       ▼
   User Service (3001)
       │ [Validate User]
       ▼
   Account Service (3002)
       │ [Check Balance]
       ▼
   Risk Assessment (3008)
       │ [Risk Scoring]
       ▼
   Currency Service (3009)
       │ [Convert Currency]
       ▼
Transaction Service (3003)
       │ [Create Transaction]
       │ [CQRS: Command → Event]
       ▼
   Event Store (3012)
       │ [Store Event]
       ▼
   Kafka Bus
       │ [Publish Events]
       ├─────────────────────┬─────────────────────┬─────────────────────┐
       ▼                     ▼                     ▼                     ▼
Payment Service (3004)  Notification (3005)    Audit Service (3006)  Analytics (3007)
   │ [Process Payment]    │ [Send Alerts]       │ [Log Activity]       │ [Update Metrics]
   │                      │                      │                      │
   ▼                      ▼                      ▼                      ▼
Kafka Response         Kafka Response         Kafka Response         Kafka Response
   │                      │                      │                      │
   └──────────────────────┼──────────────────────┼──────────────────────┘
                          ▼
                 Settlement Service (3010)
                      │ [Process Settlement]
                      ▼
                 Reporting Service (3011)
                      │ [Generate Reports]
                      ▼
                 Database Layer
                    (Dual Write)
```

## Key Communication Patterns

### 1. Request/Response Flow
```
HTTP POST /api/transactions
├── API Gateway → Transaction Service
├── Transaction Service → Account Service (balance check)
├── Transaction Service → Risk Assessment Service (fraud check)
├── Transaction Service → Currency Service (conversion)
└── Transaction Service → Payment Service (processing)
```

### 2. Event-Driven Flow
```
Transaction Created Event
├── Kafka: transaction-events
├── Payment Service (listens) → Process payment
├── Notification Service (listens) → Send confirmation
├── Audit Service (listens) → Log transaction
├── Analytics Service (listens) → Update metrics
└── Settlement Service (listens) → Queue for settlement
```

### 3. Database Synchronization
```
Dual Writer Pattern:
├── Primary: MySQL (ACID transactions)
├── Secondary: MongoDB (analytics, events)
└── Sync: Real-time replication with eventual consistency
```

## Service Dependencies Map

```
API Gateway
├── User Service (auth)
├── All Business Services (routing)
└── Shared Utils (rate limiting)

Transaction Service
├── Account Service (balance)
├── Payment Service (processing)
├── Risk Assessment (scoring)
├── Currency Service (conversion)
├── Event Store (persistence)
├── Kafka (events)
└── Database (storage)

Account Service
├── User Service (user data)
├── Database (storage)
└── Kafka (events)

Payment Service
├── External Payment Gateways
├── Database (storage)
└── Kafka (events)

Notification Service
├── Email/SMS/Push Providers
├── Database (storage)
└── Kafka (events)

Audit Service
├── All Services (audit logs)
├── Database (storage)
└── Kafka (events)

Analytics Service
├── All Services (metrics)
├── Database (read access)
└── Kafka (events)

Risk Assessment Service
├── Transaction Service (risk evaluation)
├── Database (historical data)
└── Kafka (events)

Currency Service
├── External Exchange Rate APIs
├── Redis (caching)
└── Kafka (events)

Settlement Service
├── Transaction Service (settlement data)
├── Payment Service (payment confirmations)
├── Database (storage)
└── Kafka (events)

Reporting Service
├── All Services (report data)
├── Database (read access)
└── Scheduled Jobs (automated reports)

Event Store Service
├── All Services (event storage)
├── Database (event storage)
└── Kafka (event notifications)
```

## Communication Protocols

| Pattern | Protocol | Use Case | Example |
|---------|----------|----------|---------|
| Synchronous | HTTP/REST | Request-Response | Create transaction |
| Asynchronous | Kafka | Event Streaming | Transaction completed |
| Database | MySQL/MongoDB | Data Persistence | Store transaction |
| Cache | Redis | Fast Access | Rate limiting, sessions |
| External | REST/Webhooks | Integrations | Payment gateways |

## Error Handling & Resilience

### Circuit Breaker Pattern
```
Service A → Service B
├── Closed: Normal operation
├── Open: Fast-fail responses
└── Half-Open: Test recovery
```

### Retry Logic
```
Failed Request
├── Immediate retry (network issues)
├── Exponential backoff (server errors)
└── Circuit breaker activation (persistent failures)
```

### Bulkhead Isolation
```
Resource Pools:
├── Database connections (per service)
├── HTTP client connections (per service)
└── Thread pools (per service)
```

This architecture ensures reliable, scalable, and maintainable communication between all microservices while maintaining loose coupling and high availability.