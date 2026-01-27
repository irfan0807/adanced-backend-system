# Microservices Communication Overview

## High-Level Architecture

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Clients   │────│ API Gateway │────│  Services   │
│             │    │   (3000)    │    │             │
└─────────────┘    └─────────────┘    └─────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
          ┌─────────┴─────┐ ┌─────────┴─────────┐ ┌─────┴─────────┐
          │ User Service  │ │ Account Service  │ │ Transaction  │
          │   (3001)      │ │    (3002)        │ │ Service      │
          └─────────┬─────┘ └─────────┬─────────┘ │   (3003)     │
                    │                 │           └─────┬─────────┘
                    │                 │                 │
          ┌─────────┴─────┐ ┌─────────┴─────────┐ ┌─────┴─────────┐
          │ Payment Svc   │ │ Notification Svc │ │ Audit Service│
          │   (3004)      │ │    (3005)        │ │   (3006)     │
          └─────────┬─────┘ └─────────┬─────────┘ └─────┬─────────┘
                    │                 │                 │
          ┌─────────┴─────┐ ┌─────────┴─────────┐ ┌─────┴─────────┐
          │ Analytics Svc │ │ Risk Assessment │ │ Currency Svc │
          │   (3007)      │ │    (3008)        │ │   (3009)     │
          └─────────┬─────┘ └─────────┬─────────┘ └─────┬─────────┘
                    │                 │                 │
          ┌─────────┴─────┐ ┌─────────┴─────────┐ ┌─────┴─────────┐
          │ Settlement Svc│ │ Reporting Svc   │ │ Event Store  │
          │   (3010)      │ │    (3011)        │ │ Service      │
          └─────────┬─────┘ └─────────┬─────────┘ │   (3012)     │
                    │                 │           └─────┬─────────┘
                    └─────────────────┼─────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    │         Shared Infrastructure      │
                    │  ┌─────────────┐ ┌─────────────┐  │
                    │  │   Kafka     │ │ Databases   │  │
                    │  │   Bus       │ │ (MySQL +    │  │
                    │  │             │ │  MongoDB)   │  │
                    │  └─────────────┘ └─────────────┘  │
                    └───────────────────────────────────┘
```

## Communication Types Legend

```
═══════ HTTP/REST (Synchronous)
─────── Kafka Events (Asynchronous)
••••••• Database Access (Shared)
░░░░░░░ External APIs (Integrations)
```

## Key Communication Flows

### 1. Client Request Flow
```
Client ──HTTP──► API Gateway ──HTTP──► Target Service
```

### 2. Service-to-Service Flow
```
Service A ──HTTP──► Service B (Direct calls)
Service A ──Kafka──► Service B (Event-driven)
```

### 3. Data Persistence Flow
```
Service ──Dual Write──► MySQL + MongoDB
```

### 4. External Integration Flow
```
Service ──HTTP──► External API (Payment, Email, etc.)
```

## Service Interaction Matrix

| Service | Calls | Publishes | Consumes | Database |
|---------|-------|-----------|----------|----------|
| API Gateway | All services | - | - | - |
| User Service | Account Service | user-events | - | Users |
| Account Service | - | account-events | user-events | Accounts |
| Transaction Service | Account, Payment, Risk, Currency | transaction-events | account-events | Transactions |
| Payment Service | External APIs | payment-events | transaction-events | Payments |
| Notification Service | External APIs | notification-events | all events | Notifications |
| Audit Service | - | audit-events | all events | Audit Logs |
| Analytics Service | - | - | all events | Analytics |
| Risk Assessment | - | risk-events | transaction-events | Risk Data |
| Currency Service | External APIs | currency-events | - | Exchange Rates |
| Settlement Service | - | settlement-events | payment-events | Settlements |
| Reporting Service | - | - | all events | Reports |
| Event Store | - | event-store-events | - | Events |

## Resilience Patterns Applied

- **Circuit Breaker**: Between all service-to-service calls
- **Retry Logic**: For transient failures
- **Bulkhead**: Resource isolation per service
- **Rate Limiting**: At API Gateway and service level
- **Health Checks**: All services monitored
- **Fallbacks**: Database read replicas, cached data

This architecture provides a robust, scalable, and maintainable communication framework for the transaction microservices system.