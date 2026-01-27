# Visual Guides & Code Snippets

## 📊 System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT LAYER                              │
│            (Web App, Mobile, Third-party APIs)              │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              API GATEWAY (Port 3000)                         │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Middleware Stack:                                    │  │
│  │  1. Rate Limiter (Redis)    100 req/15min per IP   │  │
│  │  2. Bulkhead                15 concurrent per svc   │  │
│  │  3. Circuit Breaker         Per-service protection  │  │
│  │  4. Security Headers        Helmet.js               │  │
│  │  5. Compression             gzip responses          │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Service Registry & Routing:                          │  │
│  │  /api/user/*        → User Service (3001)           │  │
│  │  /api/transaction/* → Transaction Service (3003)    │  │
│  │  /api/payment/*     → Payment Service (3004)        │  │
│  │  /api/audit/*       → Audit Service (3006)          │  │
│  │  ... (12 total services)                            │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────┬───────────────────────────────────────┘
                      │
          ┌───────────┼───────────┬─────────────┬──────────┐
          ▼           ▼           ▼             ▼          ▼
      ┌─────────┐ ┌────────┐ ┌──────────┐ ┌───────┐ ┌──────────┐
      │  User   │ │Account │ │Transaction││Payment││Notification│
      │Service  │ │Service │ │Service   ││Service││Service     │
      │(3001)   │ │(3002)  │ │(3003)    ││(3004) ││(3005)      │
      └────┬────┘ └───┬────┘ └────┬─────┘ └───┬───┘ └──────┬────┘
           │          │           │           │            │
           │ CQRS     │ CQRS      │ CQRS      │ CQRS       │ CQRS
           │ Pattern  │ Pattern   │ Pattern   │ Pattern    │ Pattern
           │          │           │           │            │
           └──────────┼───────────┼───────────┼────────────┘
                      │           │           │
                      ▼ Commands  ▼ Events   ▼ Queries
                ┌─────────────────────────────────────┐
                │     COMMAND BUS & QUERY BUS         │
                │  (Validation, Middleware Chain)     │
                └────────┬──────────┬──────────────────┘
                         │          │
            ┌────────────┼──────────┼────────────────┐
            ▼            ▼          ▼                ▼
      ┌──────────────────────────────────────────────────┐
      │           PERSISTENCE LAYER                      │
      │  ┌──────────────────────────────────────────┐  │
      │  │ Event Store (Event Sourcing)             │  │
      │  │ - Immutable event log                    │  │
      │  │ - Dual writes: MySQL + MongoDB          │  │
      │  │ - Snapshots for performance              │  │
      │  │ - Published to Kafka                     │  │
      │  └──────────────────────────────────────────┘  │
      │                                                 │
      │  ┌──────────────────────────────────────────┐  │
      │  │ Dual Database Writer                     │  │
      │  │ ┌──────────────────────────────────────┐ │  │
      │  │ │ MySQL (Primary)                      │ │  │
      │  │ │ - ACID transactions                  │ │  │
      │  │ │ - Strong consistency                 │ │  │
      │  │ │ - Connection Pool: 20 max            │ │  │
      │  │ │ - Circuit Breaker per DB             │ │  │
      │  │ └──────────────────────────────────────┘ │  │
      │  │ ┌──────────────────────────────────────┐ │  │
      │  │ │ MongoDB (Replica)                    │ │  │
      │  │ │ - Document storage                   │ │  │
      │  │ │ - Eventual consistency               │ │  │
      │  │ │ - Read model optimization            │ │  │
      │  │ │ - Connection Pool: 20 max            │ │  │
      │  │ └──────────────────────────────────────┘ │  │
      │  │ ┌──────────────────────────────────────┐ │  │
      │  │ │ Google Spanner (Global)              │ │  │
      │  │ │ - Global consistency                 │ │  │
      │  │ │ - Geographically distributed         │ │  │
      │  │ │ - Circuit Breaker protection         │ │  │
      │  │ └──────────────────────────────────────┘ │  │
      │  └──────────────────────────────────────────┘  │
      └──────────────────────────────────────────────────┘
                      │
                      ▼
      ┌────────────────────────────────────────┐
      │    KAFKA MESSAGE QUEUE                 │
      │  ┌──────────────────────────────────┐  │
      │  │ Topic: domain-events             │  │
      │  │ Topic: failed-writes (retry)     │  │
      │  │ Topic: compensation-events       │  │
      │  │ Topic: transaction-events        │  │
      │  │ Topic: notification-events       │  │
      │  │ Topic: audit-events              │  │
      │  └──────────────────────────────────┘  │
      │  3 Partitions per topic for parallelism │
      │  7-day retention for audit trail        │
      └────────────────┬─────────────────────────┘
                       │
       ┌───────────────┼───────────────┐
       ▼               ▼               ▼
  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
  │ Analytics   │ │ Notifications│ │ Audit       │
  │ Service     │ │ Service      │ │ Service     │
  │ (Consumes   │ │ (Consumes    │ │ (Consumes   │
  │  events)    │ │  events)     │ │  events)    │
  └─────────────┘ └─────────────┘ └─────────────┘
```

---

## 🔄 Request Flow: Create Transaction

```
STEP 1: Client Request
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
POST /api/transaction/transactions HTTP/1.1
Content-Type: application/json

{
  "userId": "user_123",
  "type": "transfer",
  "amount": 100.00,
  "fromAccount": "acc_1",
  "toAccount": "acc_2",
  "currency": "USD"
}

STEP 2: API Gateway Processing
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2a. Rate Limiter Check
    ✓ Client IP: 192.168.1.1
    ✓ Used: 45/100 requests this window
    ✓ Status: ALLOWED

2b. Bulkhead Check
    ✓ transaction-pool: 12/15 active
    ✓ Status: SLOT AVAILABLE

2c. Circuit Breaker Check
    ✓ transaction-service: CLOSED
    ✓ Error Rate: 0.2%
    ✓ Status: READY

2d. Headers & Middleware
    ✓ Add security headers (Helmet)
    ✓ Apply compression
    ✓ Generate request ID

STEP 3: Route to Service
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Forward to: http://localhost:3003/transactions

STEP 4: Transaction Service Handler
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4a. Create Command Object
    CreateTransactionCommand {
      userId: 'user_123',
      type: 'transfer',
      amount: 100,
      fromAccount: 'acc_1',
      toAccount: 'acc_2'
    }

4b. Execute through Command Bus
    - Validation Middleware
    - Audit Middleware
    - Call Handler

4c. Handler Execution
    - Validate user exists
    - Validate accounts exist
    - Check balance sufficient
    - Create transaction object
    - Generate transaction ID

STEP 5: Event Sourcing
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Save Events:
  Event 1: TransactionCreatedEvent
  Event 2: RiskAssessmentInitiatedEvent
  Event 3: TransactionApprovedEvent

Save to MySQL:
  INSERT INTO event_store ...

Save to MongoDB:
  db.event_store.insertOne(...)

Publish to Kafka:
  Topic: domain-events
  Messages: [event1, event2, event3]

STEP 6: Dual Database Write
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Parallel Writes:
  MySQL:    INSERT transaction ✓
  MongoDB:  INSERT transaction ✓
  Spanner:  INSERT transaction ✓

All succeeded!
Write ID: write_1234567890

STEP 7: Async Processing
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Kafka Consumers Process Events:
  Analytics Service:    ✓ Recorded metrics
  Notification Service: ✓ Queued email
  Audit Service:        ✓ Logged event

STEP 8: Response
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HTTP/1.1 201 Created
Content-Type: application/json
X-RateLimit-Remaining: 54
X-RateLimit-Reset: 2025-11-14T15:45:00Z
X-Service: transaction

{
  "success": true,
  "data": {
    "id": "txn_abc123",
    "userId": "user_123",
    "amount": 100.00,
    "status": "PENDING",
    "createdAt": "2025-11-14T10:30:00Z"
  },
  "timestamp": "2025-11-14T10:30:00Z"
}

TOTAL TIME: ~50-100ms
```

---

## 🎯 Circuit Breaker State Transitions

```
                    CLOSED STATE
                   ✓ Normal ops
                   ✓ Request passes through
                   ✓ Failure count monitored
                        │
                        │ Failure rate > 50%
                        │ (after monitoring period)
                        ▼
                    OPEN STATE
                   ✗ Fast reject
                   ✗ No timeout wait
                   ✗ Resource saved
                        │
                        │ After 30 seconds
                        │
                        ▼
                   HALF_OPEN STATE
                   ? Test mode
                   ? Single request allowed
                   ? If succeeds: go CLOSED
                   ? If fails: go OPEN
                        │
          ┌─────────────┼─────────────┐
          │ Success     │ Failure     │
          ▼             ▼
       CLOSED ←─────→ OPEN
          (go back)    (wait 30s)

Example Sequence:
T=0:    Request 1: CLOSED → OK
T=10:   Request 2: CLOSED → Timeout
T=20:   Request 3: CLOSED → Timeout (50% fail rate)
T=25:   Circuit OPENS
T=26:   Request 4: OPEN → Rejected immediately (1ms)
T=30:   Request 5: OPEN → Rejected immediately (1ms)
T=55:   Wait 30s, now HALF_OPEN
T=56:   Request 6: HALF_OPEN → Try it
T=60:   Success! → Back to CLOSED
T=70:   Request 7: CLOSED → OK (normal)
```

---

## 📊 Rate Limiter Timeline

```
Sliding Window (15 minutes = 900,000ms)

Timeline:
T=0ms       Window opens [0ms ─────── 900,000ms]
T=100ms     Request 1: Added ✓
T=200ms     Request 2: Added ✓
...
T=450,000ms Request 50: Added ✓
            Requests used: 50/100 ✓

T=550,000ms  Request 51: Added ✓
T=600,000ms  Request 52-100: Added ✓
             Requests used: 100/100 (FULL)

T=610,000ms  Request 101: Rejected ✗ (429 Too Many Requests)
             Requests used: 100/100
             Reset time: T=900,000ms

T=650,000ms  Request 102: Still rejected ✗
             Requests used: 100/100

[Sliding window keeps removing old requests]

T=900,100ms  Window slides: [100ms ─────── 900,100ms]
             Oldest request (T=100ms) removed
             Requests used: 99/100
             Request 103: Added ✓

T=901,000ms  Request 104: Added ✓
             Requests used: 100/100
             New reset time: T=1,801,000ms
```

---

## 🔁 Event Sourcing State Reconstruction

```
Event Log (Immutable):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Event 1: TransactionCreatedEvent
  {
    id: 'evt_1',
    aggregateId: 'txn_123',
    type: 'transfer',
    amount: 100,
    fromAccount: 'acc_1',
    toAccount: 'acc_2',
    status: 'PENDING'
  }

Event 2: RiskAssessmentCompletedEvent
  {
    id: 'evt_2',
    aggregateId: 'txn_123',
    riskScore: 0.3,
    approved: true
  }

Event 3: AccountDebited
  {
    id: 'evt_3',
    aggregateId: 'txn_123',
    accountId: 'acc_1',
    amount: -100,
    newBalance: 900
  }

Event 4: AccountCredited
  {
    id: 'evt_4',
    aggregateId: 'txn_123',
    accountId: 'acc_2',
    amount: 100,
    newBalance: 600
  }

Event 5: TransactionCompletedEvent
  {
    id: 'evt_5',
    aggregateId: 'txn_123',
    status: 'COMPLETED',
    completedAt: '2025-11-14T10:30:05Z'
  }

Current State Reconstruction:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Start: {}

Process Event 1:
  transaction = {
    id: 'txn_123',
    type: 'transfer',
    amount: 100,
    status: 'PENDING'
  }

Process Event 2:
  transaction.riskScore = 0.3
  transaction.riskApproved = true

Process Event 3 & 4:
  transaction.fromAccount = 'acc_1'
  transaction.toAccount = 'acc_2'

Process Event 5:
  transaction.status = 'COMPLETED'
  transaction.completedAt = '2025-11-14T10:30:05Z'

Final State:
  {
    id: 'txn_123',
    type: 'transfer',
    amount: 100,
    status: 'COMPLETED',
    fromAccount: 'acc_1',
    toAccount: 'acc_2',
    riskScore: 0.3,
    riskApproved: true,
    completedAt: '2025-11-14T10:30:05Z'
  }

Snapshots:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Without snapshot (1000 events):
  Replay: 1000 events → 5 seconds

With snapshot at event 500:
  Replay: 500 events → 2.5 seconds
  Savings: 50% faster

With snapshot at event 750:
  Replay: 250 events → 1.25 seconds
  Savings: 75% faster
```

---

## 🔄 Saga Pattern: Transfer Failure & Compensation

```
SUCCESSFUL SAGA:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Step 1: Risk Assessment Service
  → Check transaction risk score
  → Result: APPROVED ✓

Step 2: Account Service (Debit)
  → Debit from Account A: -$100
  → Account A: $1000 → $900
  → Result: SUCCESS ✓

Step 3: Account Service (Credit)
  → Credit to Account B: +$100
  → Account B: $500 → $600
  → Result: SUCCESS ✓

Step 4: Payment Service
  → Mark as settled
  → Result: SUCCESS ✓

Final State:
  Account A: $900 ✓
  Account B: $600 ✓
  Transaction: COMPLETED ✓

───────────────────────────────────────────────────

FAILED SAGA (WITH COMPENSATION):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Step 1: Risk Assessment Service
  → Check transaction risk score
  → Result: APPROVED ✓

Step 2: Account Service (Debit)
  → Debit from Account A: -$100
  → Account A: $1000 → $900
  → Result: SUCCESS ✓

Step 3: Account Service (Credit)
  → Credit to Account B: +$100
  → Timeout after 30 seconds
  → Result: FAILURE ✗

COMPENSATION TRIGGERED:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Reverse Step 2 (Compensation):
  → Credit back to Account A: +$100
  → Account A: $900 → $1000
  → Result: SUCCESS ✓

Final State:
  Account A: $1000 ✓ (back to original)
  Account B: $500 ✓ (unchanged)
  Transaction: FAILED & ROLLED BACK ✓

Events Log:
  Event 1: TransactionCreated
  Event 2: RiskApproved
  Event 3: AccountDebited
  Event 4: AccountCreditFailed
  Event 5: DebitCompensated
  Event 6: TransactionFailed
```

---

## 💻 Code Snippets for Interview

### CircuitBreaker Usage

```javascript
const breaker = new CircuitBreaker({
  timeout: 30000,
  errorThreshold: 50,
  resetTimeout: 30000
});

async function callPaymentService(data) {
  try {
    const result = await breaker.execute(async () => {
      return await axios.post('http://payment-service/pay', data);
    });
    return result;
  } catch (error) {
    if (breaker.getState().state === 'OPEN') {
      console.log('Circuit OPEN - failing fast!');
    }
    throw error;
  }
}

// Usage
const payment = await callPaymentService(transactionData);
```

### Retry with Backoff

```javascript
const retry = new RetryWithBackoff({
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  jitterMax: 100
});

async function reliableCall() {
  return await retry.execute(
    async () => {
      return await axios.get('http://api/data');
    },
    (error) => {
      // Only retry on network errors, not validation errors
      return error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT';
    }
  );
}

// Attempt 1: Fail, wait 1050ms
// Attempt 2: Fail, wait 2080ms
// Attempt 3: Fail, wait 4030ms
// Attempt 4: Success!
```

### Rate Limiter

```javascript
const limiter = new RateLimiter({
  windowMs: 900000,
  maxRequests: 100
});

app.use(async (req, res, next) => {
  const clientId = req.ip;
  const result = await limiter.slidingWindowLog(clientId);
  
  if (!result.allowed) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      retryAfter: new Date(result.resetTime).toISOString()
    });
  }
  
  res.set({
    'X-RateLimit-Remaining': result.remaining,
    'X-RateLimit-Reset': new Date(result.resetTime).toISOString()
  });
  
  next();
});
```

### Command Bus with Middleware

```javascript
const commandBus = new CommandBus();

// Add validation middleware
commandBus.addMiddleware(async (context) => {
  const errors = validateCommand(context.command);
  if (errors.length) throw new ValidationError(errors);
  return context;
});

// Add audit middleware
commandBus.addMiddleware(async (context) => {
  await auditService.log({
    command: context.command.constructor.name,
    timestamp: new Date()
  });
  return context;
});

// Register handler
commandBus.registerHandler('CreateTransactionCommand', {
  handle: async (command) => {
    const transaction = await createTransaction(command.data);
    await eventStore.saveEvents(transaction.id, [
      new TransactionCreatedEvent(transaction)
    ]);
    return transaction;
  }
});

// Execute
const transaction = await commandBus.execute(new CreateTransactionCommand(data));
```

### Event Store & Replay

```javascript
// Save events
await eventStore.saveEvents('txn_123', [
  new TransactionCreatedEvent(data),
  new TransactionProcessedEvent(data)
]);

// Register event handler
eventStore.registerEventHandler('TransactionCreatedEvent', async (event) => {
  console.log('Transaction created:', event.aggregateId);
});

// Replay events
const eventCount = await eventStore.replayEvents('txn_123', 0);
console.log(`Replayed ${eventCount} events`);

// Get current state from replay
let currentState = {};
await eventStore.replayEvents('txn_123', 0, (event) => {
  switch (event.eventType) {
    case 'TransactionCreatedEvent':
      currentState = { ...event.eventData, status: 'PENDING' };
      break;
    case 'TransactionCompletedEvent':
      currentState.status = 'COMPLETED';
      break;
  }
});
```

### Dual Database Write

```javascript
const results = await dualWriter.writeToAllDatabases(
  {
    id: 'txn_123',
    amount: 100,
    status: 'PENDING'
  },
  { requireAllDatabases: false }
);

// Result:
{
  writeId: 'write_1234567890',
  success: [
    { database: 'mysql', result: { insertId: 1 } },
    { database: 'mongodb', result: { insertedId: ObjectId(...) } }
  ],
  failures: [
    { database: 'spanner', error: 'Timeout' }
  ]
}

// Handle failures
if (results.failures.length > 0) {
  console.log('Some databases failed, queued for retry');
  // Already queued to Kafka for async retry
}
```

---

## 📈 Performance Comparison

```
WITHOUT PATTERNS:
Request comes in → calls service → waits 30s for timeout → fails
10 requests: 10 × 30s = 300 seconds wasted

WITH CIRCUIT BREAKER:
Request 1-5: Normal
Request 6: Circuit opens (after threshold)
Requests 7-100: Fail immediately (1ms each)
Result: 5 × 30s + 95 × 0.001s = 150.095 seconds
Savings: ~99% improvement

WITHOUT RATE LIMITING:
Attacker sends 100,000 requests
Server tries to process all
Database connections exhausted
System crashes

WITH RATE LIMITING:
Attacker limited to 100 requests per 15 min
Other users can still use system
System stays up

WITHOUT BULKHEAD:
Payment service slow
Blocks all connections
User service can't get connections
Cascade failure

WITH BULKHEAD:
Payment service limited to 15 slots
User service gets separate 15 slots
Isolated failure

WITHOUT RETRY:
Network hiccup → Request fails
User sees error

WITH RETRY + BACKOFF:
Network hiccup → Automatic retry after 1s
Usually succeeds on second try
User doesn't see error
```

---

## 🎯 Key Takeaways for Interview

1. **Distributed Systems**: Handle failures, not if but when
2. **Resilience**: Multiple layers of protection (defense in depth)
3. **Trade-offs**: Complexity vs reliability
4. **Monitoring**: Can't optimize what you don't measure
5. **Scalability**: Horizontal scaling via stateless design
6. **Consistency**: Eventual consistency + compensation patterns
7. **Auditability**: Event sourcing for compliance
8. **Communication**: Clear architecture, easy to explain

