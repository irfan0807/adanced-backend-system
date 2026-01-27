# Transaction Service Deep Dive

## Overview

The Transaction Service is the **heart** of the system. It processes all financial transactions using sophisticated patterns and coordination across multiple services.

## Architecture

```
┌─────────────────────────────────────────┐
│     API Gateway (Port 3000)             │
│  Rate Limit → Bulkhead → Route          │
└────────────────┬────────────────────────┘
                 │
      POST /api/transaction/transactions
                 │
┌────────────────▼────────────────────────┐
│   Transaction Service (Port 3003)       │
│  ┌──────────────────────────────────┐  │
│  │     Command Bus Handler          │  │
│  │  - Validate request             │  │
│  │  - Create transaction object    │  │
│  │  - Execute saga                 │  │
│  └────────┬─────────────────────────┘  │
│           │                            │
│  ┌────────▼──────────┬──────────────┐ │
│  │ Event Store       │ Dual Writer  │ │
│  │ - Save events     │ - MySQL      │ │
│  │ - Publish Kafka   │ - MongoDB    │ │
│  │                   │ - Spanner    │ │
│  └────────┬──────────┴──────────────┘ │
│           │                            │
└───────────┼────────────────────────────┘
            │
       ┌────┴────┐
       │          │
    Kafka     Database
    Events    Operations
```

## Request Flow: Create Transaction

### Step 1: Incoming Request
```javascript
POST /api/transaction/transactions
{
  "userId": "user_123",
  "type": "transfer",
  "amount": 100.00,
  "fromAccount": "acc_1",
  "toAccount": "acc_2",
  "currency": "USD",
  "description": "Payment"
}
```

### Step 2: API Gateway Processing
```
1. Rate Limiter: Check if client_ip used less than 100 requests/15min
   - Result: ✓ Allowed
   
2. Bulkhead: Check if transaction-pool has capacity
   - Active: 12/15
   - Result: ✓ Accepted
   
3. Circuit Breaker: Check transaction service health
   - State: CLOSED
   - Error Rate: 0.2%
   - Result: ✓ Ready
   
4. Route to Service: localhost:3003/transactions
```

### Step 3: Transaction Service Handler
```javascript
app.post('/transactions', async (req, res) => {
  try {
    // Create command object
    const createTxnCommand = new CreateTransactionCommand(req.body);
    
    // Execute through command bus (with validation middleware)
    const transaction = await commandBus.execute(createTxnCommand);
    
    // If we reach here, transaction created successfully
    res.status(201).json({
      success: true,
      data: transaction,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error creating transaction:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```

### Step 4: Command Bus Execution
```javascript
// CommandBus flow:
1. Validate handler exists for CreateTransactionCommand
2. Execute middleware chain:
   a. Logging middleware: Log command received
   b. Validation middleware: Validate amounts, accounts exist
   c. Audit middleware: Log who initiated

3. Execute handler:
   - Create transaction object
   - Generate UUID
   - Set initial status to PENDING

4. Emit events:
   - commandExecuting event
   - commandExecuted event

5. Return transaction object
```

### Step 5: Event Sourcing
```javascript
// Save events to event store
const events = [
  new TransactionCreatedEvent({
    id: transaction.id,
    userId: user_123,
    amount: 100,
    status: 'PENDING',
    createdAt: new Date()
  }),
  new RiskAssessmentInitiatedEvent({
    transactionId: transaction.id,
    riskScore: 0.3
  })
];

// Save to both MySQL and MongoDB
await eventStore.saveEvents(transaction.id, events);

// Publish to Kafka
await kafkaService.produce('domain-events', {
  key: transaction.id,
  value: JSON.stringify(events[0]),
  headers: { eventType: 'TransactionCreated' }
});
```

### Step 6: Database Write
```javascript
// Dual database writer
const results = await dualWriter.writeToAllDatabases({
  id: transaction.id,
  userId: user_123,
  amount: 100,
  status: 'PENDING',
  createdAt: new Date()
}, { requireAllDatabases: false });

// MySQL insert
INSERT INTO transactions (id, user_id, amount, status, created_at)
VALUES ('txn_1234', 'user_123', 100, 'PENDING', NOW());

// MongoDB insert
db.transactions.insertOne({
  _id: 'txn_1234',
  userId: 'user_123',
  amount: 100,
  status: 'PENDING',
  createdAt: ISODate()
});

// Spanner insert (Google Cloud)
INSERT INTO transactions (id, user_id, amount, status, created_at)
VALUES ('txn_1234', 'user_123', 100, 'PENDING', CURRENT_TIMESTAMP());

// Results:
{
  writeId: 'write_1234567890',
  success: [
    { database: 'mysql', result: {...} },
    { database: 'mongodb', result: {...} }
  ],
  failures: [
    { database: 'spanner', error: 'Timeout' }
  ]
}
```

## Saga Pattern for Distributed Transactions

### What is a Saga?

A saga is a sequence of operations across multiple services that should complete together or compensate if any fails.

### Example: Transfer Money (Debit from Account A, Credit to Account B)

```
Traditional (would fail in middle):
BEGIN TRANSACTION
  Debit Account A: -$100
  Credit Account B: +$100
COMMIT

Microservices (can't use single transaction):
Service 1 (Account Service): Debit Account A (may fail)
Service 2 (Account Service): Credit Account B (may fail)
→ What if Service 2 fails after Service 1 succeeds?

Solution: Saga with compensation
```

### Saga Execution Flow

```
Step 1: Debit Account A → Success
  AccountA: 1000 → 900

Step 2: Credit Account B → Success
  AccountB: 500 → 600

Result: Transaction Complete ✓

---

Alternative scenario:

Step 1: Debit Account A → Success
  AccountA: 1000 → 900

Step 2: Credit Account B → FAILS (timeout)
  AccountB: 500 (unchanged)

Compensation:
  Restore AccountA: 900 → 1000 (compensation step 1)

Result: Transaction Rolled Back ✓
```

### Implementation

```javascript
class TransactionService {
  async executeSaga(transactionId, steps) {
    const executedSteps = [];
    
    try {
      // Execute each step
      for (const step of steps) {
        const result = await this.executeStep(step);
        executedSteps.push({
          ...step,
          status: 'SUCCESS',
          result
        });
      }
      
      // All steps succeeded
      await eventStore.saveEvents(transactionId, [
        new SagaCompletedEvent({ transactionId, steps: executedSteps })
      ]);
      
      return { status: 'COMPLETED', steps: executedSteps };
      
    } catch (error) {
      // One step failed, compensate
      await this.compensate(transactionId, executedSteps);
      
      await eventStore.saveEvents(transactionId, [
        new SagaFailedEvent({
          transactionId,
          failedStep: error.step,
          compensatedSteps: executedSteps
        })
      ]);
      
      throw error;
    }
  }
  
  async compensate(transactionId, executedSteps) {
    // Reverse order - compensate last executed step first
    for (let i = executedSteps.length - 1; i >= 0; i--) {
      const step = executedSteps[i];
      try {
        await this.executeCompensation(step);
      } catch (error) {
        console.error(`Failed to compensate step ${i}:`, error);
        // Log for manual intervention
        await auditService.logCompensationFailure(transactionId, step, error);
      }
    }
  }
  
  async executeStep(step) {
    // Retry + Circuit Breaker protection
    return await circuitBreaker.execute(async () => {
      return await retryLogic.execute(async () => {
        // Call service based on step.service
        const response = await axios.post(
          `http://localhost:3002/api/${step.service}/${step.action}`,
          step.data
        );
        return response.data;
      });
    });
  }
  
  async executeCompensation(step) {
    // Map action to compensation
    const compensationMap = {
      'debit': 'credit',
      'credit': 'debit',
      'reserve': 'release',
      'hold': 'unhold'
    };
    
    const compensationAction = compensationMap[step.action];
    
    return await axios.post(
      `http://localhost:3002/api/${step.service}/${compensationAction}`,
      step.data
    );
  }
}
```

### Saga Choreography vs Orchestration

#### Choreography (Event-Driven)
```
Service A: TransactionStarted
  → emits → TransactionStartedEvent
               ↓
Service B: listens to TransactionStartedEvent
  → Performs debit
  → emits → AccountDebited Event
               ↓
Service C: listens to AccountDebited Event
  → Performs credit
  → emits → AccountCredited Event
               ↓
Service D: listens to AccountCredited Event
  → Transaction complete
```

**Pros:** Loose coupling, easy to extend
**Cons:** Hard to understand flow, difficult to troubleshoot

#### Orchestration (Centralized)
```
Saga Orchestrator (Transaction Service):
  1. Call Account Service: debit
  2. Call Account Service: credit
  3. Call Settlement Service: settle
  4. Return result

Explicit flow, easier to understand
```

**This system uses:** Orchestration (centralized) for clarity and control

## Query Processing

### Read Model vs Write Model

```
Write Model (Command Handler):
- Normalized data structure
- ACID transactions
- Eventual consistency with reads
- Stored in MySQL (transactional)

Read Model (Query Handler):
- Denormalized for fast reads
- Optimized for queries
- May be slightly stale
- Stored in MongoDB (optimized for read queries)
```

### Example: Get Transaction

```javascript
// Query handler
queryBus.registerHandler('GetTransactionQuery', {
  handle: async (query) => {
    // Read from MongoDB read model
    const transaction = await transactionReadModel.findById(query.transactionId);
    
    if (!transaction) {
      throw new Error('Transaction not found');
    }
    
    return transaction;
  }
});

// Execute query
const result = await queryBus.execute(
  new GetTransactionQuery({ transactionId: 'txn_123' })
);

// Result includes:
// - Transaction details (normalized from events)
// - Status history
// - All related information
// - From cache/MongoDB, very fast (no joins needed)
```

### Synchronizing Read Model with Write Model

```javascript
// Event handler updates read model
eventStore.registerEventHandler('TransactionCreatedEvent', async (event) => {
  // Denormalize into read model
  await transactionReadModel.insertOne({
    _id: event.aggregateId,
    userId: event.eventData.userId,
    amount: event.eventData.amount,
    status: 'PENDING',
    createdAt: event.timestamp,
    events: [event]  // Track events for audit
  });
});

eventStore.registerEventHandler('TransactionCompletedEvent', async (event) => {
  // Update read model
  await transactionReadModel.updateOne(
    { _id: event.aggregateId },
    {
      $set: { status: 'COMPLETED' },
      $push: { events: event }
    }
  );
});

// When transaction completes:
// 1. Event saved to event store
// 2. Event published to Kafka
// 3. Event handler updates read model (MongoDB)
// 4. Next query gets fresh data
```

## Error Handling

### Types of Errors

#### 1. Validation Errors (4xx)
```javascript
// Invalid input
if (!req.body.amount || req.body.amount <= 0) {
  return res.status(400).json({
    error: 'Invalid amount',
    details: 'Amount must be greater than 0'
  });
}
```

#### 2. Not Found Errors (404)
```javascript
const transaction = await transactionService.getTransaction(id);
if (!transaction) {
  return res.status(404).json({
    error: 'Transaction not found',
    transactionId: id
  });
}
```

#### 3. Rate Limit Errors (429)
```javascript
// Gateway already handles this
// Returns 429 Too Many Requests
```

#### 4. Service Unavailable (503)
```javascript
// Circuit breaker returns this
// When service is down or slow
{
  error: 'Service unavailable',
  service: 'transaction',
  message: 'The requested service is currently unavailable'
}
```

#### 5. Internal Server Errors (500)
```javascript
try {
  // Process transaction
} catch (error) {
  logger.error('Unhandled error:', error);
  return res.status(500).json({
    error: 'Internal server error',
    requestId: req.id,  // For tracking in logs
    timestamp: new Date().toISOString()
  });
}
```

## Monitoring & Observability

### Metrics Endpoint

```bash
GET /metrics

Response:
{
  "service": "transaction-service",
  "timestamp": "2025-11-14T10:30:00Z",
  "database": {
    "mysql": {
      "size": 12,
      "available": 8,
      "borrowed": 4,
      "utilization": "60%"
    },
    "mongodb": {
      "connected": true
    }
  },
  "dualWriter": {
    "mysql": { "state": "CLOSED", "failureRate": 0.5% },
    "mongodb": { "state": "CLOSED", "failureRate": 0.3% },
    "spanner": { "state": "CLOSED", "failureRate": 0.1% }
  },
  "eventStore": {
    "eventsPublished": 150000,
    "eventsSaved": 150000,
    "failedPublishes": 5
  }
}
```

### Health Endpoint

```bash
GET /health

Response:
{
  "status": "healthy",
  "service": "transaction-service",
  "timestamp": "2025-11-14T10:30:00Z",
  "dependencies": {
    "database": {
      "mysql": "connected",
      "mongodb": "connected"
    },
    "messaging": {
      "kafka": "connected"
    },
    "eventStore": "operational"
  }
}
```

### Logging

```javascript
// Winston logger captures:
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: 'logs/transaction-service.log'
    })
  ]
});

// Log levels:
logger.error('Critical error');      // Errors that need attention
logger.warn('Warning');               // Potential issues
logger.info('Transaction created');   // Important events
logger.debug('Database query');       // Debugging info

// Example:
logger.info('Transaction created', {
  transactionId: 'txn_123',
  userId: 'user_123',
  amount: 100,
  status: 'PENDING',
  duration: 123  // milliseconds
});
```

## Performance Optimization

### Connection Pooling Benefits

```
Without pooling:
Create connection: 100ms
Execute query: 50ms
Close connection: 100ms
Total per request: 250ms

With pooling (20 connections):
Get from pool: 1ms
Execute query: 50ms
Return to pool: 1ms
Total per request: 52ms

Performance gain: ~5x faster!
With 1000 concurrent users: 250 seconds → 52 seconds
```

### Caching Strategy

```javascript
// Cache transaction in Redis
const CACHE_KEY = `transaction:${transactionId}`;
const CACHE_TTL = 300;  // 5 minutes

// Check cache first
let transaction = await redis.get(CACHE_KEY);
if (transaction) {
  return JSON.parse(transaction);  // Cache hit!
}

// Cache miss, query database
transaction = await db.findTransaction(transactionId);

// Store in cache for next request
await redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(transaction));

return transaction;
```

**Cache Invalidation:**
```javascript
// When transaction status changes
await commandBus.execute(new UpdateTransactionStatusCommand(id, newStatus));

// Invalidate cache
await redis.del(`transaction:${id}`);

// Next query will fetch fresh data from database
```

