# Quick Reference & Implementation Guide

## Project Structure Quick Reference

```
project/
├── index.js                          # Entry point
├── package.json                      # Dependencies
├── README.md                         # Project overview
├── INTERVIEW_GUIDE.md               # Main interview documentation
├── TRANSACTION_SERVICE_GUIDE.md     # Transaction service deep dive
├── PATTERNS_AND_ARCHITECTURE_GUIDE.md # Pattern explanations
├── logs/                            # Application logs
├── src/
│   ├── api-gateway/
│   │   └── server.js               # Gateway - routing & rate limiting
│   │
│   ├── services/
│   │   ├── transaction-service/
│   │   │   ├── server.js           # Express app setup
│   │   │   ├── transaction-service.js  # Business logic
│   │   │   ├── commands/
│   │   │   │   └── transaction-commands.js  # Command definitions
│   │   │   └── queries/
│   │   │       └── transaction-queries.js   # Query definitions
│   │   └── user-service/
│   │       └── server.js           # User management
│   │
│   └── shared/
│       ├── cqrs/
│       │   ├── command-bus.js      # Command routing & execution
│       │   └── query-bus.js        # Query routing & execution
│       │
│       ├── database/
│       │   ├── connection-pool.js  # MySQL & MongoDB pooling
│       │   └── dual-writer.js      # Multi-database writes
│       │
│       ├── event-sourcing/
│       │   └── event-store.js      # Event storage & replay
│       │
│       ├── messaging/
│       │   └── kafka-service.js    # Event streaming
│       │
│       └── patterns/
│           ├── circuit-breaker.js  # Failure detection
│           ├── rate-limiter.js     # Request throttling
│           ├── bulkhead.js         # Resource isolation
│           └── retry-with-backoff.js # Retry logic
```

---

## Key Files & Their Purposes

### 1. API Gateway (`src/api-gateway/server.js`)

**Purpose:** Single entry point for all requests

**Key Responsibilities:**
- Route requests to appropriate microservice
- Apply rate limiting (100 requests/15 min)
- Manage circuit breakers (per service)
- Enforce bulkhead pools (15 concurrent per service)
- Add security headers (Helmet)
- Compress responses

**Key Classes Used:**
- `RateLimiter` - Redis-backed sliding window
- `CircuitBreaker` - Failure detection
- `Bulkhead` - Resource isolation

**Endpoints:**
```
GET  /health              # System health
GET  /metrics             # Performance metrics
GET  /api/discovery/services  # List all services
POST /api/{service}/**    # Route to service
```

### 2. Transaction Service (`src/services/transaction-service/`)

**Purpose:** Core business logic for transactions

**Files:**
- `server.js` - Express setup and routes
- `transaction-service.js` - Business logic (creates/updates transactions)
- `commands/transaction-commands.js` - Command definitions
- `queries/transaction-queries.js` - Query definitions

**Flow:**
```
Request → server.js → CommandBus → Handler
                                    ├─ EventStore (save events)
                                    ├─ DualWriter (write to DBs)
                                    └─ KafkaService (publish events)
```

**Key Patterns Used:**
- CQRS (command bus + query bus)
- Event sourcing (store events)
- Saga pattern (distributed transactions)
- Dual database writing

### 3. CQRS Buses (`src/shared/cqrs/`)

**CommandBus (`command-bus.js`):**
```javascript
// Responsibilities:
1. Register command handlers
2. Execute commands with middleware
3. Emit lifecycle events (executing, executed, failed)
4. Validate handler exists before executing
5. Support middleware chain for cross-cutting concerns

Usage:
const bus = new CommandBus();
bus.registerHandler('CreateTransactionCommand', handler);
bus.addMiddleware(validationMiddleware);
bus.addMiddleware(auditMiddleware);
const result = await bus.execute(command);
```

**QueryBus (`query-bus.js`):**
```javascript
// Similar to CommandBus but for queries
// Queries should be read-only
// Can be cached more aggressively
// Can use eventual consistency

Usage:
const bus = new QueryBus();
bus.registerHandler('GetTransactionQuery', handler);
const result = await bus.execute(query);
```

### 4. Resilience Patterns (`src/shared/patterns/`)

**CircuitBreaker (`circuit-breaker.js`):**
```javascript
// States: CLOSED → OPEN → HALF_OPEN → CLOSED
// When OPEN: Fast fail (no timeout)
// When HALF_OPEN: Try request, if succeeds close
// Monitors failure rate and automatic recovery

Configuration:
- timeout: Per-request timeout (30 seconds)
- errorThreshold: % error rate to open (50%)
- resetTimeout: Wait before trying again (30 seconds)
- monitoringPeriod: Check interval (10 seconds)
```

**RateLimiter (`rate-limiter.js`):**
```javascript
// Uses Redis sorted sets for efficiency
// Window: 15 minutes
// Limit: 100 requests per window
// Tracks per client IP

Two algorithms:
1. Fixed window - Simple, some burst possible
2. Sliding window log - More accurate, more memory

This system uses sliding window
```

**Bulkhead (`bulkhead.js`):**
```javascript
// Thread pool pattern for resource isolation
// Pool per service type
// Queue with timeout for overflow
// Statistics on utilization

Configuration:
- Pool size: 15 per service
- Timeout: 30 seconds for queued requests
- Queue management: FIFO with timeout

Metrics:
- active: Currently executing
- queued: Waiting for slot
- utilization: active / size %
```

**RetryWithBackoff (`retry-with-backoff.js`):**
```javascript
// Exponential backoff: baseDelay × (2 ^ attempt)
// Jitter: Random 0-100ms to avoid thundering herd
// Max retries: 3
// Max delay: 30 seconds

Formula: min(baseDelay × 2^attempt + jitter, maxDelay)

Attempt 0: 1000 + jitter
Attempt 1: 2000 + jitter
Attempt 2: 4000 + jitter
```

### 5. Database Layer (`src/shared/database/`)

**ConnectionPool (`connection-pool.js`):**
```javascript
// Manages MySQL and MongoDB connections
// Generic connection pooling

MySQL Configuration:
- Max: 20 connections
- Min: 5 connections (kept warm)
- Acquire timeout: 30 seconds
- Idle timeout: 5 minutes
- Health check on borrow

MongoDB Configuration:
- Max pool size: 20
- Min pool size: 5
- Idle timeout: 5 minutes
- Server selection timeout: 30 seconds

Benefits:
- Connection reuse (expensive to create)
- Resource limits (prevent exhaustion)
- Automatic cleanup (stale connections)
- Health checks (validate on use)
```

**DualWriter (`dual-writer.js`):**
```javascript
// Writes to MySQL, MongoDB, and Google Spanner in parallel
// Each has own circuit breaker
// Failed writes queued to Kafka for retry
// Compensation logic for consistency failures

Write Process:
1. Parallel writes to all DBs
2. Collect results
3. If all succeed: ✓ Done
4. If some fail: Queue for retry + log
5. If consistency required and failures: Trigger rollback

Circuit Breaker per DB:
- MySQL: 30s timeout, 50% error threshold
- MongoDB: 30s timeout, 50% error threshold
- Spanner: 30s timeout, 50% error threshold
```

### 6. Event Sourcing (`src/shared/event-sourcing/`)

**EventStore (`event-store.js`):**
```javascript
// Stores immutable events (complete audit trail)
// Saves to both MySQL and MongoDB
// Publishes to Kafka for other services

Key Methods:
- saveEvents(aggregateId, events) - Save events
- getEvents(aggregateId, fromVersion) - Retrieve events
- replayEvents(aggregateId, fromVersion) - Replay to handler
- createSnapshot(aggregateId, version, data) - Performance optimization
- getLatestSnapshot(aggregateId) - Get last snapshot

Event Structure:
{
  id: UUID,
  aggregateId: string,
  eventType: string,
  eventData: JSON,
  eventVersion: number,
  timestamp: Date,
  metadata: object
}

Snapshots:
- Created every N events for performance
- Contains state at snapshot point
- Reduces replay time

Usage:
await eventStore.saveEvents('txn_123', [
  new TransactionCreatedEvent(data),
  new TransactionProcessedEvent(data)
]);

events = await eventStore.getEvents('txn_123');
await eventStore.replayEvents('txn_123', handler);
```

### 7. Messaging (`src/shared/messaging/`)

**KafkaService (`kafka-service.js`):**
```javascript
// Event streaming platform
// Multiple consumers per topic
// Retention: 7 days
// Partitions: 3 per topic

Topics:
- domain-events: All business events
- failed-writes: Retry queue
- compensation-events: Rollback requests
- transaction-events: Transaction specific
- notification-events: Notifications
- audit-events: Audit trail

Producer Usage:
await kafkaService.produce('domain-events', {
  key: 'txn_123',
  value: JSON.stringify(event),
  headers: { eventType: 'TransactionCreated' }
});

Consumer Usage:
const consumer = await kafkaService.consumeMessages(
  ['domain-events'],
  'analytics-group',
  async (message) => {
    // Handle message
  }
);
```

---

## How to Explain Each Component in Interview

### 1. API Gateway

**"Tell me about the API Gateway"**

*Structure your answer:*
```
1. Purpose (30 seconds)
   - Single entry point for all requests
   - Central place for cross-cutting concerns
   
2. Key Features (1-2 minutes)
   - Rate limiting (100 req/15 min per IP)
   - Circuit breaker (per service protection)
   - Bulkhead (resource isolation, 15 concurrent per service)
   - Service discovery and routing
   
3. How it protects the system (1-2 minutes)
   - Rate limiting prevents DDoS
   - Circuit breaker prevents cascade failures
   - Bulkhead prevents resource starvation
   - Early failure detection saves resources
   
4. Example scenario (1-2 minutes)
   - Payment service starts timing out
   - Circuit breaker detects (after first few failures)
   - Opens circuit (stops trying)
   - Returns 503 immediately (fast fail)
   - After 30s, tests if recovered (HALF_OPEN)
   - If still down, stays OPEN
   - If recovered, goes back to CLOSED
```

### 2. Circuit Breaker

**"How does the Circuit Breaker prevent cascade failures?"**

```
1. Define the problem (45 seconds)
   - Service slow/down → timeout (30 seconds)
   - Multiple requests → multiply (30s × 100 = 3000s)
   - Resources exhausted → cascade failure
   
2. The solution (1-2 minutes)
   - Monitor failure rate
   - If exceeds threshold (50%) → OPEN state
   - OPEN state → reject immediately (fast fail)
   - Save resources, prevent cascade
   
3. Recovery mechanism (1 minute)
   - After reset timeout (30s) → HALF_OPEN
   - Try single request carefully
   - If succeeds → CLOSED (recovered)
   - If fails → OPEN (not ready yet)
   
4. Real numbers (30 seconds)
   - Without: 100 requests × 30s = 3000 seconds wasted
   - With circuit breaker: 100 requests × 1ms = 0.1 seconds
   - Savings: 30,000x improvement
```

### 3. Rate Limiter

**"How does rate limiting work?"**

```
1. Problem & solution (45 seconds)
   - Problem: One client uses all resources
   - Solution: Limit requests per client per time window
   
2. Implementation (1-2 minutes)
   - Redis sorted sets (efficient)
   - Time window: 15 minutes
   - Limit: 100 requests per window
   - Per client: Track by IP address
   
3. Sliding window algorithm (1-2 minutes)
   - Window: [T-15min, T]
   - Remove entries older than 15min
   - Count current requests
   - If count < 100: Allow + increment
   - If count >= 100: Reject with 429
   
4. Response headers (30 seconds)
   - X-RateLimit-Remaining: 54
   - X-RateLimit-Reset: timestamp
   - Client can adjust request rate
```

### 4. Bulkhead

**"What is the Bulkhead pattern?"**

```
1. Problem (30 seconds)
   - One slow service blocks all others
   - Limited resource pool (connections)
   - No isolation between services
   
2. Solution (1-2 minutes)
   - Separate pools per service type
   - 15 slots per pool
   - One service can't starve others
   - Limits blast radius of failures
   
3. Implementation (1-2 minutes)
   - Create pool per service
   - Execute request in pool
   - If available: immediate
   - If full: queue (30s timeout)
   - If queue times out: reject
   
4. Example (1 minute)
   - Transaction service total: 20 connections
   - Payment service: Can use max 15
   - User service: Can use max 15
   - (overlaps okay, just isolation)
```

### 5. Event Sourcing

**"Why use Event Sourcing?"**

```
1. Traditional vs Event Sourcing (1 minute)
   - Traditional: Store current state (transaction status = COMPLETED)
   - Event Sourcing: Store sequence of events (CREATED → PROCESSED → COMPLETED)
   - Traditional: Lose history
   - Event Sourcing: Complete audit trail
   
2. Benefits (1-2 minutes)
   - Compliance: Required for financial systems
   - Debugging: Replay events to understand what happened
   - Analytics: Replay with different logic
   - Time travel: See state at any point in past
   
3. How it works (1-2 minutes)
   - Store events immutably
   - Replay events to reconstruct state
   - Snapshots for performance (every 1000 events)
   
4. Trade-offs (45 seconds)
   - Benefit: Complete history
   - Cost: More complex code
   - Cost: More storage (all events retained)
   - Decision: For financial systems, worth it
```

### 6. CQRS (Command Query Responsibility Segregation)

**"Why separate Commands and Queries?"**

```
1. Why separate (1 minute)
   - Commands (writes) and Queries (reads) have different requirements
   - Writes: Need ACID, validation, durability
   - Reads: Can be eventual consistent, denormalized, cached
   
2. Implementation (1-2 minutes)
   - Separate command bus and query bus
   - Command handlers: Modify state, publish events
   - Query handlers: Read from optimized read model
   - Eventual consistency between them
   
3. Benefits (1-2 minutes)
   - Optimize separately (MySQL for writes, MongoDB for reads)
   - Scale independently
   - Different latency requirements
   - Better performance
   
4. Synchronization (1 minute)
   - Command modifies write model
   - Event published to Kafka
   - Event handler updates read model
   - Eventually consistent (milliseconds)
```

### 7. Dual Database Writing

**"How do you ensure consistency across multiple databases?"**

```
1. Challenge (45 seconds)
   - Multiple databases (MySQL, MongoDB, Spanner)
   - Need data in all three
   - What if one fails mid-write?
   
2. Solution (1-2 minutes)
   - Write to all in parallel
   - Collect results
   - If all succeed: ✓ Done
   - If some fail: Queue for retry
   - If critical failures: Trigger compensation (rollback)
   
3. Error handling (1-2 minutes)
   - Failed writes → Kafka topic "failed-writes"
   - Retry consumer processes failures
   - Exponential backoff + jitter
   - If retries exhausted → manual investigation
   
4. Consistency guarantee (1 minute)
   - Eventual consistency between DBs
   - Strong consistency within each DB
   - Compensation logic handles failures
   - Trade-off: Complexity vs consistency
```

### 8. Kafka / Messaging

**"How does event streaming work?"**

```
1. Why Kafka (45 seconds)
   - Traditional queue: Message consumed, gone
   - Kafka: Events retained (7 days)
   - Multiple consumers read same events
   - Distributed, fault tolerant
   
2. Architecture (1-2 minutes)
   - Producers: Services publish events
   - Topics: Named event streams (domain-events, transaction-events)
   - Partitions: Parallel processing (3 per topic)
   - Consumers: Services subscribe to events
   
3. How it ensures reliability (1-2 minutes)
   - Producer waits for ack (message stored)
   - Replicated across brokers
   - Consumer offset tracking
   - Can replay from any point
   
4. Example flow (1 minute)
   - Transaction service: publishes TransactionCreatedEvent
   - Analytics service: consumes, updates metrics
   - Notification service: consumes, sends email
   - Both get same event independently
```

---

## Interview Practice Scenarios

### Scenario 1: System Under Load

**Q: "Your system is receiving 10,000 requests/second. Walk me through how your architecture handles this."**

```
Answer structure:

1. API Gateway Level (1 minute)
   - Requests come in
   - Rate limiter allows 100 per client per 15 min
   - Assume distributed clients (different IPs)
   - Most requests pass rate limit
   
2. Bulkhead Isolation (1 minute)
   - Each service has 15-slot pool
   - 10,000 requests × (15 slots) = needs coordination
   - Requests queue (30s timeout)
   - Overload rejected with 503 (graceful degradation)
   
3. Database Connection Pooling (1 minute)
   - Transaction service: 20 max MySQL connections
   - Pool reuses connections
   - ~500 requests per connection per second
   - Can handle 10,000 requests/sec with connection pool
   
4. Circuit Breaker (45 seconds)
   - If service starts timing out
   - Circuit breaker detects
   - Opens after error threshold
   - Returns 503 immediately (saves resources)
   
5. Event Publishing (45 seconds)
   - Each transaction produces event
   - Kafka partitions handle throughput
   - 3 partitions = 3 parallel consumers
   
6. Result (30 seconds)
   - System gracefully degrades
   - Rejects excess with 429 or 503
   - Stays healthy (doesn't crash)
```

### Scenario 2: Payment Service Fails

**Q: "The Payment Service crashes. What happens?"**

```
Answer structure:

1. First Request (30 seconds)
   - Timeout after 30 seconds
   - Circuit breaker records failure
   
2. Subsequent Requests (45 seconds)
   - More failures accumulate
   - Failure rate exceeds 50%
   - Circuit breaker OPENS
   - Requests rejected immediately (503)
   - Resources freed for other services
   
3. Other Services (45 seconds)
   - Bulkhead isolation
   - Payment service pool saturated, but isolated
   - User service unaffected
   - Transaction service unaffected
   - Gateway routes around payment service
   
4. Recovery (1 minute)
   - After 30 seconds → HALF_OPEN state
   - Try single request
   - If Payment Service restarted: ✓ Success → CLOSED
   - If still down: ✗ Fail → OPEN (wait another 30s)
   
5. Operations (45 seconds)
   - Monitoring alerts: "Payment Service down"
   - On-call engineer investigates
   - Restarts service
   - System auto-recovers
```

### Scenario 3: Deadlock in Transaction

**Q: "A transaction starts, succeeds in Account Debit but fails in Account Credit. How does your system handle this?"**

```
Answer structure:

1. The Problem (45 seconds)
   - Account A debited: -$100
   - Account B credit failed: timeout
   - Inconsistent state!
   - Account A has -100, but transfer didn't complete
   
2. Saga Pattern Solution (1-2 minutes)
   - Step 1: Debit Account A ✓ Success
   - Step 2: Credit Account B ✗ FAILED
   - Trigger compensation
   - Step 1 Compensation: Credit Account A +$100
   - Result: Back to initial state
   
3. Event Recording (1 minute)
   - Event 1: AccountDebited
   - Event 2: AccountCreditFailed
   - Event 3: DebitCompensated
   - Kafka publishes all events
   - Complete audit trail
   
4. Notifications (45 seconds)
   - Notification service: Receives TransactionFailedEvent
   - Sends email to user: "Transaction failed, please retry"
   - Or: Manual intervention if compensation fails
   
5. Retry Strategy (45 seconds)
   - System can retry automatically
   - Exponential backoff prevents hammering
   - After max retries: Alert operations
```

---

## Key Metrics for Interview

### Performance Benchmarks
- API Gateway: **10,000+ requests/second**
- Database connections: **20 max per service**
- Circuit Breaker: **< 1ms overhead** per request
- Rate Limiting: **O(log N) Redis operation**
- Event Processing: **50,000+ events/second** via Kafka

### Reliability Metrics
- Target Availability: **99.95%** uptime
- Mean Time to Recovery (MTTR): **< 30 seconds** (circuit breaker resets)
- Error Budget: **~22 minutes downtime** per month

### Resource Metrics
- MySQL Connections: 5-20 per service
- MongoDB Connections: 5-20 per service
- Memory per service: ~100MB baseline
- CPU: Scales with load (Node.js single-threaded, but clustered)

---

## Common Pitfalls & How to Avoid Them

### 1. Not Understanding Circuit Breaker States
```
Wrong: "Circuit breaker rejects all requests when open"
Right: "Circuit breaker rejects quickly to prevent resource waste,
        then tests recovery with HALF_OPEN state"
```

### 2. Confusing Rate Limit with Timeout
```
Wrong: "Rate limiter prevents requests from timing out"
Right: "Rate limiter controls concurrency,
        Timeout prevents requests from hanging forever"
```

### 3. Thinking Event Sourcing = Complete Solution
```
Wrong: "Event Sourcing solves all consistency problems"
Right: "Event Sourcing provides audit trail,
        but still need Saga pattern for distributed transactions"
```

### 4. Not Considering Cascade Failures
```
Wrong: "I'll just call the service and wait"
Right: "I'll implement circuit breaker, retry, timeout,
        and rate limiting to prevent cascade failures"
```

### 5. Ignoring Compensation Logic
```
Wrong: "I'll just retry the operation"
Right: "I'll implement compensation for failed steps,
        so system can rollback to consistent state"
```

