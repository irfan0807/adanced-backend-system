# Advanced Transaction Microservices System - Interview Guide

## Table of Contents
1. [System Architecture Overview](#system-architecture-overview)
2. [API Gateway](#api-gateway)
3. [Core Patterns & Resilience](#core-patterns--resilience)
4. [Database Strategy](#database-strategy)
5. [Event Sourcing & CQRS](#event-sourcing--cqrs)
6. [Messaging & Integration](#messaging--integration)
7. [Key Design Decisions](#key-design-decisions)

---

## System Architecture Overview

### What is This System?
This is a **production-grade transaction microservices system** built with Node.js that handles financial transactions with 12+ specialized microservices. It's designed for high availability, fault tolerance, and distributed system challenges.

### Why Microservices?
- **Scalability**: Each service can scale independently
- **Resilience**: Failure in one service doesn't cascade to others
- **Team Independence**: Different teams can work on different services
- **Technology Flexibility**: Each service can use different tech stacks

### The 12 Microservices

| Service | Port | Purpose |
|---------|------|---------|
| **API Gateway** | 3000 | Central entry point, routing, rate limiting |
| **User Service** | 3001 | User management and authentication |
| **Account Service** | 3002 | Account management and balance tracking |
| **Transaction Service** | 3003 | Core transaction processing engine |
| **Payment Service** | 3004 | Payment processing and integration |
| **Notification Service** | 3005 | Multi-channel notifications (email, SMS, push) |
| **Audit Service** | 3006 | Comprehensive audit logging and compliance |
| **Analytics Service** | 3007 | Real-time analytics and data aggregation |
| **Risk Service** | 3008 | Fraud detection and risk assessment |
| **Currency Service** | 3009 | Exchange rates and currency conversion |
| **Settlement Service** | 3010 | Transaction settlement and reconciliation |
| **Reporting Service** | 3011 | Business intelligence and reports |
| **Event Store Service** | 3012 | Event sourcing and replay |

### High-Level Data Flow

```
User Request → API Gateway (Rate Limit + Circuit Breaker)
    ↓
Route to appropriate service
    ↓
Service processes via CQRS (Command/Query)
    ↓
Data written to Dual Databases (MySQL + MongoDB + Spanner)
    ↓
Events published to Kafka
    ↓
Event Store captures complete history
    ↓
Response returned to client
```

---

## API Gateway

### What Does It Do?
The API Gateway is the **single entry point** for all client requests. It acts as a reverse proxy that routes requests to appropriate microservices while providing cross-cutting concerns.

### Key Responsibilities

#### 1. **Routing & Service Discovery**
```javascript
// Maps URLs to microservices
/api/user/...     → User Service (3001)
/api/transaction/ → Transaction Service (3003)
/api/payment/...  → Payment Service (3004)
```

#### 2. **Rate Limiting**
- **What**: Prevents clients from making too many requests
- **How**: Redis-backed sliding window algorithm
- **Config**: 
  - Window: 900,000ms (15 minutes)
  - Max Requests: 100 per window
  - Per client: Tracked by IP address

```javascript
const rateLimiter = new RateLimiter({
  windowMs: 900000,      // 15 min window
  maxRequests: 100       // 100 requests max
});
```

#### 3. **Circuit Breaker Protection**
- **Purpose**: Prevent cascading failures when services are down
- **States**: CLOSED (normal) → OPEN (failing) → HALF_OPEN (testing)
- **Per Service**: Each microservice has its own circuit breaker
- **Recovery**: Automatically tries to recover after 30 seconds

```javascript
// If a service has 50% error rate, circuit opens
new CircuitBreaker({ 
  timeout: 30000,
  errorThreshold: 50%,
  resetTimeout: 30000
})
```

#### 4. **Bulkhead Pattern (Resource Isolation)**
- **Pool Size**: 15 concurrent requests per service
- **Queue**: Additional requests wait in queue
- **Timeout**: 30 seconds max wait
- **Benefit**: One service slowdown doesn't affect others

```javascript
bulkhead.createPool('transaction-pool', 15);
// Max 15 concurrent requests to transaction service
// Others wait in queue or timeout
```

#### 5. **Security Headers**
- Helmet.js for HTTP security headers
- CORS enabled for cross-origin requests
- Compression for response payload reduction

### Example Request Flow

```
Request: POST /api/transaction/transactions
         ↓
Step 1: Rate Limiter Check
        - Client IP: 192.168.1.1
        - Used: 45/100 requests this window
        - Status: ✓ Allowed
         ↓
Step 2: Route to Service
        - Bulkhead Pool Check: 12/15 active connections
        - Status: ✓ Can process
         ↓
Step 3: Check Circuit Breaker
        - Transaction Service Status: CLOSED
        - Success Rate: 99.5%
        - Status: ✓ Ready
         ↓
Step 4: Proxy Request
        - Forward to http://localhost:3003/transactions
         ↓
Step 5: Response
        - Add X-Service: transaction header
        - Return to client
```

### Response Headers
```
X-RateLimit-Remaining: 54
X-RateLimit-Reset: 2025-11-14T15:45:00Z
X-Service: transaction
```

### Health Endpoint
```bash
GET /health
Response:
{
  "status": "healthy",
  "services": ["user", "transaction", "payment", ...],
  "circuitBreakers": {
    "user": { "state": "CLOSED", "failureRate": 0.5% },
    "transaction": { "state": "CLOSED", "failureRate": 0.2% }
  },
  "bulkheadStats": {
    "user-pool": { "active": 12, "queued": 2, "capacity": 15 }
  }
}
```

### Design Rationale
- **Why separate from services?** Keeps services focused, enables cross-cutting concerns
- **Why rate limit?** Prevents DDoS attacks and resource exhaustion
- **Why circuit breaker?** Prevents cascading failures (key problem in microservices)
- **Why bulkhead?** Resource isolation prevents one slow service from blocking all requests

---

## Core Patterns & Resilience

### 1. Circuit Breaker Pattern

#### Problem It Solves
```
Scenario: Transaction Service is slow
Without Circuit Breaker:
- Request 1: Waits 30s → Timeout → Fails
- Request 2: Waits 30s → Timeout → Fails
- Request 3: Waits 30s → Timeout → Fails
- Resources exhausted, system crashes

With Circuit Breaker:
- Request 1-5: Fail quickly after first few failures
- Circuit OPENS (fast fail)
- System recovers, circuit closes again
- Requests resume
```

#### How It Works

**State Machine:**
```
                  ┌─ Success ─┐
                  ↓           ↑
[CLOSED] ──Error Rate > 50%──→ [OPEN]
  ↑                                ↓ (after 30s)
  └──────── Success in ─────── [HALF_OPEN]
           HALF_OPEN mode
```

**States Explained:**
- **CLOSED**: Normal operation, requests pass through
- **OPEN**: Too many failures, reject all requests quickly
- **HALF_OPEN**: Testing if service recovered, single request allowed

```javascript
// In code
const breaker = new CircuitBreaker({
  timeout: 30000,           // Per-request timeout
  errorThreshold: 50,       // 50% error rate opens circuit
  resetTimeout: 30000       // Wait 30s before HALF_OPEN
});

try {
  const result = await breaker.execute(operation);
  // If operation succeeds, state stays CLOSED
} catch (error) {
  // If too many failures, state goes to OPEN
  // Rejects immediately without trying
}
```

#### Real-World Example
```
Transaction Service starts failing:
- Request succeeds: failureCount = 0
- Request fails: failureCount = 1
- Request fails: failureCount = 2
- Failure rate = 2/3 = 66% > 50% threshold
- Circuit OPENS
- Next request: REJECTED immediately (no timeout wait)
- After 30 seconds: Try again with HALF_OPEN
- If succeeds: Go back to CLOSED
- If fails: Stay OPEN
```

### 2. Retry with Exponential Backoff + Jitter

#### Problem It Solves
```
Network Blip Example:
- Request fails (network timeout)
- Without retry: Client sees error
- With retry: Waits and retries, likely succeeds

Thundering Herd Problem:
- Multiple services retry at same time
- Overwhelms recovered service
- Need: Spread out retry attempts
```

#### How It Works

**Exponential Backoff Formula:**
```
Delay = baseDelay × (exponentialBase ^ attempt) + random_jitter

Attempt 0: 1000ms × 2^0 = 1000ms + jitter
Attempt 1: 1000ms × 2^1 = 2000ms + jitter
Attempt 2: 1000ms × 2^2 = 4000ms + jitter
```

**Example Sequence:**
```
Attempt 1: Fail, wait 1050ms (1000 + 50ms jitter)
Attempt 2: Fail, wait 2080ms (2000 + 80ms jitter)
Attempt 3: Fail, wait 4030ms (4000 + 30ms jitter)
Attempt 4: Success! Return result
Total time: ~7.2 seconds
Without jitter: All requests would retry at same times
With jitter: Spread across time window
```

```javascript
const retry = new RetryWithBackoff({
  maxRetries: 3,           // Try up to 3 times
  baseDelay: 1000,         // Start at 1 second
  maxDelay: 30000,         // Never wait more than 30s
  exponentialBase: 2,      // Double each time
  jitterMax: 100           // Random 0-100ms jitter
});

await retry.execute(
  async () => {
    return await callService();
  },
  (error) => {
    // Only retry on certain errors
    return error.code === 'ECONNREFUSED';
  }
);
```

#### Why Jitter Matters
```
Without Jitter (Thundering Herd):
  T=0s:   1000 requests retry
  T=2s:   1000 requests retry again
  T=4s:   1000 requests retry again
  Result: Service gets hammered at regular intervals

With Jitter:
  T=0s:   100 requests retry (randomly distributed 0-100ms)
  T=1.5s: 120 requests retry
  T=2.8s: 90 requests retry
  T=4.2s: 110 requests retry
  Result: Smooth load on recovering service
```

### 3. Rate Limiting (Sliding Window)

#### Problem It Solves
```
Without Rate Limiting:
- Attacker: 10,000 requests/second
- System: Overwhelmed, crashes

With Rate Limiting:
- Config: 100 requests per 15 minutes
- Attacker: After 100 requests, gets 429 (Too Many Requests)
- System: Protected
```

#### How Sliding Window Works

```
Time: ────|─────|─────|─────|─────|────
Window Size: 15 minutes
Current Time: ████ (now)

Requests in window:
- T-14:59: Request 1
- T-14:30: Request 2
- T-10:00: Request 3
- T-5:00:  Request 4 (counted as active)
- T-1:00:  Request 5 (counted as active)
- T:       New request → Increment counter

If counter > 100: Reject request
```

```javascript
async slidingWindowLog(key, cost = 1) {
  const now = Date.now();
  const windowStart = now - this.windowMs;  // 15min ago
  
  // Remove requests older than 15 minutes
  await redis.zremrangebyscore(key, '-inf', windowStart);
  
  // Count active requests
  const currentCount = await redis.zcard(key);
  
  if (currentCount + cost > this.maxRequests) {
    return { allowed: false, remaining: 0 };
  }
  
  // Add current request
  await redis.zadd(key, now, requestId);
  
  return { allowed: true, remaining: this.maxRequests - currentCount - cost };
}
```

**Implementation Details:**
- Uses **Redis sorted sets** for efficiency
- Window = 900,000ms (15 minutes)
- Max = 100 requests per window
- Per client tracking via IP address
- Response headers show remaining quota

### 4. Bulkhead Pattern

#### Problem It Solves
```
Without Bulkhead:
- Transaction Service has 1 connection pool (20 connections)
- Payment Service calls Transaction Service
- Payment Service uses all 20 connections
- User Service tries to call Transaction Service
- No connections available → User Service blocked

With Bulkhead:
- Transaction Service: 20 connections
- Payment Service gets 5 connections max
- User Service gets 5 connections max
- Notification Service gets 5 connections max
- Other services get 5 connections max
- No single service can starve others
```

#### How It Works

```javascript
// Create isolated pools for each service
bulkhead.createPool('transaction-pool', 15);  // 15 slots
bulkhead.createPool('payment-pool', 15);      // 15 slots
bulkhead.createPool('user-pool', 15);         // 15 slots

// When request comes in
await bulkhead.execute('transaction-pool', async () => {
  // If slots available: Execute immediately
  // If at capacity: Queue request
  // If queued > 30s: Timeout and reject
});
```

**Queue Management:**
```
Slots: ███ 12/15 active
Queue: ░░ 2 waiting

Request arrives:
- Slot 13/15 becomes active
- Active: ████ 13/15
- Queued request moves to slot 14/15
- Queue: ░ 1 waiting

When task completes:
- Slot 14/15 becomes active
- Next queued request processes
```

**Statistics:**
```javascript
{
  "transaction-pool": {
    "active": 13,
    "queued": 2,
    "capacity": 15,
    "utilization": 86.7%,
    "totalRequests": 10000,
    "completedRequests": 9950,
    "failedRequests": 30,
    "rejectedRequests": 5
  }
}
```

---

## Database Strategy

### Why Multiple Databases?

#### The Problem
- **MySQL**: ACID transactions, but doesn't scale globally
- **MongoDB**: Scales globally, but eventual consistency
- **Google Spanner**: Global consistency, expensive
- **Choice**: Use all three!

### Dual Database Writer (MySQL + MongoDB + Spanner)

#### Architecture

```
Data Write Request
    ↓
DualDatabaseWriter
    ├─→ MySQL (with CircuitBreaker)
    ├─→ MongoDB (with CircuitBreaker)
    └─→ Google Spanner (with CircuitBreaker)
    
All run in parallel with individual error handling
```

#### Code Flow

```javascript
const results = await dualWriter.writeToAllDatabases(data);
// Returns:
{
  writeId: "write_1234567890",
  success: [
    { database: "mysql", result: {...} },
    { database: "mongodb", result: {...} }
  ],
  failures: [
    { database: "spanner", error: "Timeout" }
  ],
  timestamp: "2025-11-14T10:30:00Z"
}
```

#### Step-by-Step Write Process

**1. Writing to MySQL:**
```javascript
// Begin transaction
BEGIN TRANSACTION;

// Insert into main table
INSERT INTO transactions (id, write_id, data, created_at) 
VALUES (?, ?, ?, NOW());

// Insert into audit log
INSERT INTO write_audit (write_id, database_name, status) 
VALUES (?, 'mysql', 'success');

// Commit or rollback
COMMIT; // or ROLLBACK on error
```

**2. Writing to MongoDB:**
```javascript
// Start session for transaction
const session = db.client.startSession();

// Use transaction in session
await session.withTransaction(async () => {
  // Insert into main collection
  await db.collection('transactions').insertOne({
    ...data,
    writeId,
    createdAt: new Date()
  }, { session });
  
  // Insert into audit collection
  await db.collection('write_audit').insertOne({
    writeId,
    databaseName: 'mongodb',
    status: 'success'
  }, { session });
});
```

**3. Spanner (Google Cloud):**
```javascript
// Spanner has built-in transactions and global consistency
// Similar to MySQL but with global replication
```

#### Handling Failures

**Scenario: MongoDB write fails**

```
1. MySQL write succeeds ✓
2. MongoDB write fails ✗
3. Spanner write succeeds ✓

Result: Inconsistency!

Solution:
1. Queue failed write to Kafka topic: "failed-writes"
2. Create compensation event: "COMPENSATION_REQUIRED"
3. Trigger rollback:
   - DELETE from MySQL where writeId = ?
   - DELETE from MongoDB where writeId = ?
   - DELETE from Spanner where writeId = ?
4. Retry later with exponential backoff
```

```javascript
// Queue failed write for retry
await dualWriter.queueFailedWrite('mongodb', data, writeId, error);

// Later, async process handles retry
// Failed-writes consumer:
// - Reads from Kafka
// - Attempts write to MongoDB again
// - If succeeds: Remove from retry queue
// - If fails: Move to dead letter queue
```

#### Connection Pooling

**MySQL Pool Configuration:**
```javascript
{
  max: 20,                    // Max 20 connections
  min: 5,                     // Keep 5 idle connections
  acquireTimeoutMillis: 30000,   // Wait 30s for connection
  idleTimeoutMillis: 300000,     // Close after 5min idle
  reapIntervalMillis: 10000,     // Check every 10s
  testOnBorrow: true          // Validate connection on use
}
```

**MongoDB Pool Configuration:**
```javascript
{
  maxPoolSize: 20,            // Max 20 connections
  minPoolSize: 5,             // Keep 5 idle
  maxIdleTimeMS: 300000,      // Close after 5min idle
  waitQueueTimeoutMS: 30000,  // Wait 30s for connection
  serverSelectionTimeoutMS: 30000
}
```

**Benefits:**
- Reuse connections (expensive to create)
- Limit concurrent connections
- Auto-cleanup stale connections
- Health checks on borrowed connections

#### Statistics Endpoint

```javascript
GET /metrics

Response:
{
  "database": {
    "mysql": {
      "size": 12,           // Current connections
      "available": 8,       // Idle connections
      "borrowed": 4,        // In-use connections
      "pending": 2,         // Waiting for connection
      "max": 20,
      "min": 5
    },
    "mongodb": {
      "connected": true,
      "poolSize": 12
    }
  },
  "dualWriter": {
    "mysql": { "state": "CLOSED", "failureRate": 0.5% },
    "mongodb": { "state": "CLOSED", "failureRate": 0.3% },
    "spanner": { "state": "CLOSED", "failureRate": 0.1% }
  }
}
```

---

## Event Sourcing & CQRS

### What is Event Sourcing?

#### Traditional Approach (State-Based)
```
Transaction Table:
ID  | Status  | Amount | Balance | LastUpdated
1   | PENDING | 100    | 500     | 2025-11-14 10:00:00

Update:
Transaction 1 status changes to COMPLETED
(Old data: PENDING → Discarded)
(New data: COMPLETED → Stored)

Problem: No history! Why did it change? Who changed it?
```

#### Event Sourcing Approach (Event-Based)
```
Event Store:
ID | AggregateID | EventType              | EventData                | Timestamp
1  | txn_123     | TransactionCreated     | {amount: 100, ...}      | 2025-11-14 10:00:00
2  | txn_123     | RiskAssessmentPassed   | {riskScore: 0.2, ...}   | 2025-11-14 10:00:05
3  | txn_123     | AccountDebited         | {accountId: acc_1, ...} | 2025-11-14 10:00:10
4  | txn_123     | AccountCredited        | {accountId: acc_2, ...} | 2025-11-14 10:00:15
5  | txn_123     | TransactionCompleted   | {settlementId: s_1, ...}| 2025-11-14 10:00:20

Benefits:
- Complete history of what happened
- Know when each state change occurred
- Know who initiated changes
- Can replay events to reconstruct state
- Can debug issues by replaying
```

### Event Store Implementation

```javascript
// Save events
const events = [
  new TransactionCreatedEvent(transactionData),
  new TransactionProcessedEvent(processData),
  new TransactionCompletedEvent(completionData)
];

const savedEvents = await eventStore.saveEvents('txn_123', events);

// Events saved to MySQL and MongoDB in parallel
// Events published to Kafka for other services
```

#### Step-by-Step Save Process

**1. Save to MySQL:**
```sql
INSERT INTO event_store 
(id, aggregate_id, event_type, event_data, event_version, timestamp, metadata) 
VALUES 
(?, 'txn_123', 'TransactionCreated', '{"amount":100}', 1, NOW(), '{}'),
(?, 'txn_123', 'TransactionProcessed', '{"status":"completed"}', 2, NOW(), '{}');
```

**2. Save to MongoDB:**
```javascript
db.collection('event_store').insertMany([
  {
    id: 'evt_1',
    aggregateId: 'txn_123',
    eventType: 'TransactionCreated',
    eventData: { amount: 100 },
    eventVersion: 1,
    timestamp: ISODate(),
    metadata: {}
  }
]);
```

**3. Publish to Kafka:**
```
Topic: domain-events
Messages:
- Key: txn_123
- Value: {"eventType":"TransactionCreated","amount":100}
- Headers: { eventType: "TransactionCreated", eventVersion: "1" }
```

### Replaying Events (Reconstructing State)

```javascript
// Get all events for a transaction
const events = await eventStore.getEvents('txn_123');

// Replay them to reconstruct current state
let transaction = {};

events.forEach(event => {
  switch(event.eventType) {
    case 'TransactionCreated':
      transaction = {
        id: 'txn_123',
        amount: event.eventData.amount,
        status: 'PENDING',
        createdAt: event.timestamp
      };
      break;
      
    case 'TransactionProcessed':
      transaction.status = 'PROCESSING';
      break;
      
    case 'TransactionCompleted':
      transaction.status = 'COMPLETED';
      transaction.completedAt = event.timestamp;
      break;
  }
});

// transaction now contains current state
// {
//   id: 'txn_123',
//   amount: 100,
//   status: 'COMPLETED',
//   createdAt: ...,
//   completedAt: ...
// }
```

### Snapshots (Performance Optimization)

#### Problem
```
Transaction with 10 years of history:
- 10,000 events
- Replaying all 10,000 events takes 5 seconds
- Every time we need current state: 5 second wait
- Unacceptable for real-time operations
```

#### Solution: Snapshots
```
Snapshot at event 5000:
- State at event 5000: {...}
- Timestamp: 2023-11-14

Need current state:
- Load snapshot (state at event 5000)
- Load events 5001-10000 (9500 events instead of 10000)
- Replay only 9500 events: 4.75 seconds saved!

Snapshots at event 7500:
- Load snapshot (state at event 7500)
- Load events 7501-10000 (2500 events)
- Replay 2500 events: 1.25 seconds total
```

```javascript
// Create snapshot every 1000 events
if (eventVersion % 1000 === 0) {
  await eventStore.createSnapshot('txn_123', eventVersion, currentState);
}

// When replaying
const snapshot = await eventStore.getLatestSnapshot('txn_123');
// Load events after snapshot
const events = await eventStore.getEvents('txn_123', snapshot.version);
// Replay only new events
```

### CQRS (Command Query Responsibility Segregation)

#### What is CQRS?

Traditional approach:
```
Request → Service → Read/Update Model → Database → Response
```

CQRS approach:
```
Commands (writes)          Queries (reads)
Request                    Request
  ↓                          ↓
CommandBus                 QueryBus
  ↓                          ↓
Update Model (MySQL)       Read Model (MongoDB/Cache)
  ↓                          ↓
Response                   Response
```

#### Why Separate?

```
Example: eCommerce Platform

Commands (Writes):
- CreateOrder: Need ACID guarantees
- PaymentProcessed: Need immediate consistency
- InventoryDecremented: Must not lose data

Queries (Reads):
- GetOrderHistory: Can be eventual consistent
- GetUserProfile: Can be cached
- GetProductRecommendations: Can be denormalized

Different requirements:
- Writes: Fast, consistent, durable
- Reads: Super fast, can be eventual consistent

Solution: Different models optimized for each
```

#### Command Bus

```javascript
// Register command handler
commandBus.registerHandler('CreateTransactionCommand', {
  handle: async (command) => {
    // Validate
    validateTransactionData(command.data);
    
    // Execute
    const transaction = await createTransaction(command.data);
    
    // Emit event
    await eventStore.saveEvents(transaction.id, [
      new TransactionCreatedEvent(transaction)
    ]);
    
    return transaction;
  }
});

// Execute command
const createCmd = new CreateTransactionCommand({
  amount: 100,
  fromAccount: 'acc_1',
  toAccount: 'acc_2'
});

const transaction = await commandBus.execute(createCmd);
```

**Flow:**
```
1. CommandBus.execute(command) called
2. Find handler for command type
3. Apply middlewares (validation, logging, etc.)
4. Execute handler.handle()
5. Emit 'commandExecuted' event
6. Return result
```

#### Query Bus

```javascript
// Register query handler
queryBus.registerHandler('GetTransactionQuery', {
  handle: async (query) => {
    // Query from read model (MongoDB)
    return await transactionReadModel.findById(query.id);
  }
});

// Execute query
const getQuery = new GetTransactionQuery({ id: 'txn_123' });
const transaction = await queryBus.execute(getQuery);
```

**Key Difference from Command:**
```
Commands: Modify data, return minimal result
- Input: Data to write
- Output: ID or confirmation
- Side effects: YES (data changes)

Queries: Read data, return results
- Input: Search criteria
- Output: Complete data
- Side effects: NO (read-only)
```

#### Middleware Pattern

```javascript
// Add middleware to command bus
commandBus.addMiddleware(async (context) => {
  // Log command
  console.log('Executing command:', context.command.constructor.name);
  return context;
});

commandBus.addMiddleware(async (context) => {
  // Validate
  const errors = validateCommand(context.command);
  if (errors.length) throw new ValidationError(errors);
  return context;
});

commandBus.addMiddleware(async (context) => {
  // Audit
  await auditService.logCommand(context.command);
  return context;
});

// When execute called:
// 1. Middleware 1 (logging)
// 2. Middleware 2 (validation)
// 3. Middleware 3 (audit)
// 4. Handler.handle()
```

---

## Messaging & Integration

### Kafka Service

#### What is Kafka?

```
Traditional Queue:
Request → Queue → Worker → Response
Problem: Messages consumed once, then gone

Kafka (Event Log):
Event → Kafka Topic (immutable log) → Multiple consumers can read
Benefits:
- Multiple consumers get same event
- Can replay from any point
- Fault tolerant
- Distributed and scalable
```

#### Kafka Architecture

```
Producer (services)
    ↓
[Kafka Cluster: broker1, broker2, broker3]
    ├─ Topic: domain-events (3 partitions)
    │  ├─ Partition 0: [event1, event2, event3, ...]
    │  ├─ Partition 1: [event4, event5, event6, ...]
    │  └─ Partition 2: [event7, event8, event9, ...]
    │
    ├─ Topic: failed-writes
    └─ Topic: compensation-events
    ↓
Consumers (analytics, notifications, etc.)
```

#### Topics in This System

| Topic | Purpose | Partition Strategy |
|-------|---------|-------------------|
| `domain-events` | All business events | By aggregateId |
| `failed-writes` | Failed database writes | By writeId |
| `compensation-events` | Compensation requests | By aggregateId |
| `transaction-events` | Transaction events | By transactionId |
| `notification-events` | Notification requests | By userId |
| `audit-events` | Audit trail | By userId |

#### Publishing Events

```javascript
// Produce event
await kafkaService.produce('domain-events', {
  key: 'txn_123',  // Partition key (same key → same partition)
  value: JSON.stringify({
    eventType: 'TransactionCompleted',
    amount: 100,
    timestamp: new Date()
  }),
  headers: {
    eventType: 'TransactionCompleted',
    aggregateId: 'txn_123',
    eventVersion: '5'
  }
});
```

**What happens:**
```
1. Message serialized to bytes
2. Key (txn_123) hashed to determine partition
3. Message appended to partition log
4. Replicated to other brokers
5. Producer gets acknowledgment
6. Message available for consumers
```

#### Consuming Events

```javascript
// Create consumer
const consumer = await kafkaService.consumeMessages(
  ['domain-events', 'failed-writes'],  // Topics to subscribe
  'analytics-group',                    // Consumer group
  async (message) => {
    // Handle event
    const event = JSON.parse(message.value);
    
    switch(event.eventType) {
      case 'TransactionCompleted':
        await analyticsService.recordTransaction(event);
        break;
      case 'TransactionFailed':
        await analyticsService.recordFailure(event);
        break;
    }
  }
);
```

**Consumer Groups:**
```
Topic: domain-events has 3 partitions

Consumer Group 1: analytics-service
- Partition 0 → Consumer 1
- Partition 1 → Consumer 1
- Partition 2 → Consumer 1

Consumer Group 2: notification-service
- Partition 0 → Consumer 2
- Partition 1 → Consumer 2
- Partition 2 → Consumer 2

Same message consumed by both groups independently!
```

#### Topic Configuration

```javascript
await kafkaService.createTopics([
  {
    topic: 'domain-events',
    numPartitions: 3,           // 3 partitions for parallelism
    replicationFactor: 1,       // Replicate to 1 other broker
    configEntries: [
      { name: 'cleanup.policy', value: 'delete' },    // Delete old messages
      { name: 'retention.ms', value: '604800000' }     // Keep 7 days
    ]
  }
]);
```

#### Dead Letter Queue

```javascript
// When message processing fails
try {
  await messageHandler({
    topic,
    partition,
    message,
    offset
  });
} catch (error) {
  // Send to dead letter queue
  await kafkaService.produce('domain-events-dlq', {
    key: message.key,
    value: message.value,
    headers: {
      ...message.headers,
      error: error.message,
      originalTopic: topic,
      originalOffset: offset
    }
  });
  
  // Log for investigation
  await auditService.logDLQMessage(message, error);
}
```

---

## Key Design Decisions

### 1. Why Node.js?
- **Event-driven**: Perfect for async operations
- **Non-blocking I/O**: Handles many concurrent connections
- **Easy deployment**: Single language, easy containerization
- **Developer productivity**: JavaScript, rapid development

### 2. Why Microservices Over Monolith?

#### Monolith Problems:
```
Single database:
- Database becomes bottleneck
- Can't scale independent services
- One service slow → whole system slow

Deployment:
- Change in one service → rebuild entire app
- Risk of breaking unrelated code
- Deployment takes hours

Team coordination:
- Requires constant synchronization
- Merge conflicts
- One team blocks another
```

#### Microservices Benefits:
```
Database per service:
- Each service scales independently
- Each service chooses best database
- Services not blocked by others

Deployment:
- Independent deployment
- Changes isolated to service
- Fast deployment cycles

Teams:
- Teams work independently
- Different tech stacks
- Fast iteration
```

### 3. Why Circuit Breaker Before Retry?

```
Without this order:
Request fails
→ Retry immediately (makes problem worse)
→ Circuit opens
→ Too late!

With this order:
Request fails
→ Circuit detects failure pattern
→ Fails fast before trying retry
→ Saves resources

Decision flow:
Is service healthy?
├─ YES: Try request
├─ NO (OPEN): Fail immediately
└─ TESTING (HALF_OPEN): Try request carefully
```

### 4. Why Rate Limiting Per IP?

```
Fair distribution:
Without rate limiting: One user can use all resources
With per-IP limiting: Resources distributed fairly

DDoS protection:
Attacker: 1000 different IPs, 100 requests each = 100,000 total
Per-IP limit: 100 requests per IP max = 100,000 total (capped)

Backoff protection:
If all clients retry at same time: thundering herd
Rate limiting: Spreads requests across time
```

### 5. Why Dual Database Writing?

```
CAP Theorem: Pick 2 of 3
- Consistency: All copies have same data
- Availability: System always responsive
- Partition tolerance: Works despite network failures

MySQL + MongoDB + Spanner:
- MySQL: Good consistency, good availability
- MongoDB: Good availability, eventual consistency
- Spanner: Consistency, availability, partition tolerance (expensive)

Result: Best of all worlds for different requirements
```

### 6. Why Event Sourcing?

```
Regulatory compliance:
Finance requires: Complete audit trail
Event sourcing: Natural fit (events = audit trail)

Debugging:
Bug found in production:
- Replay events with fixed code
- Understand exactly what happened
- Verify fix

Analytics:
Historical analysis:
- Replay events with different parameters
- Understand user behavior over time
- Test new algorithms on historical data
```

---

## Interview Tips

### How to Explain the System

**1. Start with the Problem**
```
"This system handles financial transactions at scale.
Key challenges:
- High concurrency (thousands of transactions/second)
- High reliability (can't lose money)
- Global distribution (multiple currencies, timezones)
- Regulatory compliance (audit trails)
"
```

**2. Explain Architecture**
```
"We built 12 microservices:
- API Gateway coordinates routing and protects system
- Core services handle business logic
- Each service has own database
- Services communicate via Kafka events
"
```

**3. Deep Dive into Interesting Patterns**
```
"Most interesting part: Circuit breaker + retry pattern
Problem: When service fails, cascading failure
Solution: Circuit breaker opens immediately, prevents waste
Then: Retry with backoff recovers gracefully
"
```

**4. Discuss Trade-offs**
```
"We chose dual database writing:
Benefit: Strong consistency + high availability
Cost: More complex, eventual consistency between DBs
Why: For financial systems, consistency is worth it
"
```

### Common Interview Questions

**Q1: How do you handle service failures?**
```
Answer:
1. Circuit Breaker: Detects failure quickly, fails fast
2. Bulkhead: Isolates resources, prevents cascade
3. Rate Limiting: Protects system from overload
4. Retry + Backoff: Recovers gracefully with jitter
5. Health Checks: Monitors service status
```

**Q2: Why Event Sourcing?**
```
Answer:
1. Complete audit trail (regulatory requirement)
2. Time travel debugging (replay events)
3. Event-driven architecture natural fit
4. Historical analysis capability
Trade-off: More complex than traditional approach
```

**Q3: How do you ensure data consistency across multiple databases?**
```
Answer:
1. Write to all databases in parallel
2. If write fails: queue for retry
3. If all fail: trigger compensation (rollback)
4. Kafka ensures events reach all consumers
5. Snapshots track consistency points
```

**Q4: How does your gateway handle 10,000 requests/second?**
```
Answer:
1. Stateless design: Easy to scale horizontally
2. Connection pooling: Reuse connections
3. Compression: Reduce payload size
4. Caching: Cache frequent queries
5. Rate limiting: Control load
6. Circuit breakers: Fail gracefully under load
```

---

## Code Examples for Interview

### Example 1: Creating a Transaction

```javascript
// Step 1: User submits request to API Gateway
POST /api/transaction/transactions
{
  "userId": "user_123",
  "type": "transfer",
  "amount": 100.00,
  "fromAccount": "acc_1",
  "toAccount": "acc_2",
  "currency": "USD"
}

// Step 2: Gateway rate limits and routes
GET /api/transaction/transactions

// Step 3: Transaction Service receives
const transactionService = {
  async createTransaction(data) {
    // Validate
    validateTransactionData(data);
    
    // Create command
    const cmd = new CreateTransactionCommand(data);
    
    // Execute through command bus
    const transaction = await commandBus.execute(cmd);
    
    // Save events
    await eventStore.saveEvents(transaction.id, [
      new TransactionCreatedEvent(transaction)
    ]);
    
    // Write to databases
    const results = await dualWriter.writeToAllDatabases({
      id: transaction.id,
      ...transaction
    });
    
    // Publish event to Kafka
    await kafkaService.produce('transaction-events', {
      key: transaction.id,
      value: JSON.stringify(transaction)
    });
    
    return transaction;
  }
};
```

### Example 2: Circuit Breaker in Action

```javascript
// Service is failing
let failureCount = 0;

for (let i = 0; i < 10; i++) {
  try {
    await circuitBreaker.execute(async () => {
      // Simulated service call that fails
      throw new Error('Service timeout');
    });
  } catch (error) {
    failureCount++;
    console.log(`Attempt ${i + 1}: ${error.message}`);
    
    // Monitor circuit state
    const state = circuitBreaker.getState();
    console.log(`Circuit state: ${state.state}`);
    console.log(`Failure rate: ${state.failureRate}%`);
    
    if (state.state === 'OPEN') {
      console.log('Circuit OPEN - fast failing subsequent requests');
    }
  }
}

// Output:
// Attempt 1: Service timeout (CLOSED, failureRate: 100%)
// Attempt 2: Service timeout (CLOSED, failureRate: 100%)
// Attempt 3: Service timeout (OPEN, failureRate: 100%) ← Circuit opens
// Attempt 4: Circuit breaker is OPEN (instant, no wait!)
// Attempt 5: Circuit breaker is OPEN (instant, no wait!)
// [after 30 seconds]
// Attempt 6: Testing... (HALF_OPEN) - if succeeds, goes CLOSED
```

### Example 3: Event Replay

```javascript
// Original state at time T1:
// Transaction: { status: 'PENDING', amount: 100 }

// Business logic changes (bug fix) at time T2:
// New calculation: amount should be 110

// Event sourcing allows replay:
const transaction = {};
const events = await eventStore.getEvents('txn_123');

events.forEach(event => {
  if (event.eventType === 'TransactionCreated') {
    transaction.amount = event.eventData.amount * 1.1; // New logic
    transaction.status = 'PENDING';
  }
  if (event.eventType === 'TransactionCompleted') {
    transaction.status = 'COMPLETED';
  }
});

// Result: 110 (corrected amount with original events)
// Can run this analysis on historical data
// Verify fix works before deploying to production
```

