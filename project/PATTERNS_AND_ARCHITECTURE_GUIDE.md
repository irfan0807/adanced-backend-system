# Advanced Patterns & Architecture Guide

## Resilience Patterns Deep Dive

### The Cascade Failure Problem

Imagine a distributed system where Service A calls Service B:

```
Without Resilience:
User Request
    ↓
Service A tries to call Service B
    ↓
Service B is slow/down
    ↓
Service A waits 30 seconds for timeout
    ↓
User's connection hangs
    ↓
User tries again (now 2 requests waiting)
    ↓
Users try again (10 requests waiting)
    ↓
Service A runs out of connections
    ↓
Service A crashes
    ↓
All users affected (cascade failure)
```

### The Solution: Resilience Pattern Stack

```
Level 1: Circuit Breaker
├─ Problem: Slow services waste resources
├─ Solution: Fail fast when service is unhealthy
└─ Benefit: Free up resources for other requests

Level 2: Retry with Backoff
├─ Problem: Temporary failures should recover
├─ Solution: Retry after delay, don't hammer service
└─ Benefit: Recovers from transient failures

Level 3: Rate Limiting
├─ Problem: System gets overwhelmed
├─ Solution: Limit requests per client
└─ Benefit: Fair resource distribution

Level 4: Bulkhead
├─ Problem: One slow service blocks others
├─ Solution: Isolate resources per service
└─ Benefit: Limit blast radius of failures

Level 5: Timeout
├─ Problem: Requests hang forever
├─ Solution: Cancel request after timeout
└─ Benefit: Fail fast instead of hanging
```

### Pattern Application Order

```javascript
// Good order: Check quickly first, then try
if (circuitBreaker.isOpen()) {
  // 1ms check
  throw new Error('Service down, fail immediately');
}

if (rateLimiter.isExceeded()) {
  // 1ms check
  throw new Error('Rate limit exceeded');
}

// Only if both checks pass, try the actual request
await retryWithBackoff.execute(
  async () => {
    return await callService();
  }
);
```

---

## Distributed Transaction Handling

### The Problem: ACID in Microservices

**ACID Requirements:**
- **Atomicity**: All or nothing
- **Consistency**: Valid state after transaction
- **Isolation**: No interference between transactions
- **Durability**: Survives failures

**In single database:** Easy (use transactions)
**In microservices:** Hard (no single database)

### Solutions Compared

#### 1. Two-Phase Commit (2PC)

```
Phase 1: Prepare
  Coordinator asks all participants: "Can you commit?"
  A: "Yes, I'm ready"
  B: "Yes, I'm ready"
  C: "Yes, I'm ready"

Phase 2: Commit
  Coordinator: "Go ahead, commit"
  A: Commits
  B: Commits
  C: Commits

Problem: If network splits during Phase 2, system blocks forever
Not recommended for modern systems
```

#### 2. Saga Pattern (Used in this system)

```
Sequential Saga:
Step 1: Service A: Debit account
        ✓ Success
Step 2: Service B: Credit account
        ✓ Success
Result: Complete

Failure scenario:
Step 1: Service A: Debit account
        ✓ Success
Step 2: Service B: Credit account
        ✗ FAILS
Compensation:
        Service A: Refund (reverse debit)
        ✓ Success
Result: Rolled back to initial state
```

**Pros:**
- Works across services
- No global locks
- Good for long-running operations

**Cons:**
- More complex code
- Compensation logic needed
- Final consistency (not immediate)

#### 3. Event Sourcing Based

```
Store every change as immutable event:
Event 1: AccountDebited(amount: 100)
Event 2: AccountCredited(amount: 100)
Event 3: TransactionCompleted()

Reconstruct state by replaying events:
Start with balance: 1000
→ After Event 1: 900 (debited)
→ After Event 2: 1000 (credited)
→ After Event 3: 1000 (completed)

Can replay with different logic for analysis
```

---

## Database Consistency Models

### Immediate Consistency
```
User writes data
↓
System processes
↓
All copies have same data immediately
↓
Next read sees new data

Example: MySQL transaction

Cost: Can't scale globally
```

### Eventual Consistency
```
User writes data
↓
Primary database updated immediately
↓
Replicated to secondary databases
↓
After delay (milliseconds to seconds)
All copies consistent

During delay: Reads might see old data

Example: MongoDB replication

Cost: Must handle stale reads
```

### Strong Eventual Consistency
```
Users can see old data temporarily
BUT:
- Never see conflicting states
- Conflicts automatically resolved
- Eventually all see same data

Example: Distributed database with vector clocks

Cost: High complexity
```

### This System's Approach

```
Immediate within single database:
→ MySQL: ACID transactions

Eventual between databases:
→ MySQL ← Event → MongoDB
→ MongoDB ← Event → Spanner

Strategy:
- Write command changes MySQL (immediate)
- Event published to Kafka
- Other services update their read models (eventual)
- If read model behind, query MySQL (authoritative)
```

---

## API Gateway Patterns

### Why API Gateway?

```
Without gateway:
Client
  ├─→ Service A (3001)
  ├─→ Service B (3002)
  ├─→ Service C (3003)
  └─→ Service D (3004)

Problems:
- Client knows all service locations
- Client must handle all errors
- No central monitoring
- Security scattered across services
- No rate limiting

With gateway:
Client → API Gateway (3000)
              ├─→ Service A
              ├─→ Service B
              ├─→ Service C
              └─→ Service D

Benefits:
- Single entry point
- Centralized security
- Rate limiting in one place
- Service discovery
- Request transformation
```

### Gateway Responsibilities

#### 1. Service Discovery
```javascript
// Define service locations
const services = {
  user: 'http://localhost:3001',
  transaction: 'http://localhost:3003',
  payment: 'http://localhost:3004'
};

// Route based on URL
app.use('/api/user', proxy(services.user));
app.use('/api/transaction', proxy(services.transaction));
app.use('/api/payment', proxy(services.payment));
```

#### 2. Request Transformation
```javascript
// Add authentication header
app.use((req, res, next) => {
  req.headers['X-Service-Request-ID'] = generateRequestId();
  req.headers['X-Request-Timestamp'] = new Date().toISOString();
  req.headers['X-Client-IP'] = req.ip;
  next();
});

// Validate request format
app.use(express.json({ limit: '10mb' }));

// Compress response
app.use(compression());
```

#### 3. Response Transformation
```javascript
// Standardize response format
app.use((req, res, next) => {
  const originalJson = res.json;
  
  res.json = function(data) {
    return originalJson.call(this, {
      timestamp: new Date().toISOString(),
      success: true,
      data
    });
  };
  
  next();
});
```

#### 4. Load Balancing
```javascript
// Round-robin load balancing
const instances = [
  'http://localhost:3001',
  'http://localhost:3001',  // Can duplicate for weighted balancing
  'http://localhost:3001'
];

let currentIndex = 0;

function getNextInstance() {
  const instance = instances[currentIndex];
  currentIndex = (currentIndex + 1) % instances.length;
  return instance;
}

// Each request goes to next instance in rotation
```

#### 5. Health Checking
```javascript
// Periodically check service health
setInterval(async () => {
  for (const [service, url] of Object.entries(services)) {
    try {
      const response = await axios.get(`${url}/health`, {
        timeout: 5000
      });
      
      if (response.status === 200) {
        serviceHealth[service] = 'UP';
      }
    } catch (error) {
      serviceHealth[service] = 'DOWN';
      // Update circuit breaker
      circuitBreakers[service].recordFailure();
    }
  }
}, 10000);  // Check every 10 seconds
```

---

## CQRS Pattern Explained

### Why Separate Commands and Queries?

**Different Characteristics:**
```
Commands (writes):
- Modify state
- Should be fast
- Require validation
- Single writer (one service owns)
- ACID transaction preferred

Queries (reads):
- Don't modify state
- Can be slow (acceptable latency)
- Return data
- Multiple readers
- Can be eventual consistent
```

### Practical Example: E-commerce Order

**Command: CreateOrder**
```javascript
class CreateOrderCommand {
  constructor(data) {
    this.userId = data.userId;
    this.items = data.items;  // Must validate each item exists
    this.shippingAddress = data.shippingAddress;
  }
}

// Handler
commandBus.registerHandler('CreateOrderCommand', {
  handle: async (command) => {
    // 1. Validate user exists
    const user = await userService.getUser(command.userId);
    if (!user) throw new Error('User not found');
    
    // 2. Validate items in stock
    for (const item of command.items) {
      const product = await inventoryService.check(item.id);
      if (product.stock < item.quantity) {
        throw new Error('Insufficient stock');
      }
    }
    
    // 3. Reserve items
    for (const item of command.items) {
      await inventoryService.reserve(item.id, item.quantity);
    }
    
    // 4. Create order
    const order = {
      id: generateOrderId(),
      userId: command.userId,
      items: command.items,
      status: 'PENDING_PAYMENT',
      createdAt: new Date()
    };
    
    // 5. Save to write model (MySQL)
    await orderWriteModel.save(order);
    
    // 6. Publish event
    await eventBus.publish(new OrderCreatedEvent(order));
    
    return order;
  }
});
```

**Query: GetOrderHistory**
```javascript
class GetOrderHistoryQuery {
  constructor(userId, limit = 10) {
    this.userId = userId;
    this.limit = limit;
  }
}

// Handler
queryBus.registerHandler('GetOrderHistoryQuery', {
  handle: async (query) => {
    // 1. Query read model (MongoDB with denormalized data)
    const orders = await orderReadModel
      .find({ userId: query.userId })
      .limit(query.limit)
      .sort({ createdAt: -1 })
      .toArray();
    
    // 2. Enrich with related data (already stored in denormalized form)
    const enriched = orders.map(order => ({
      ...order,
      itemCount: order.items.length,
      totalAmount: calculateTotal(order.items)
    }));
    
    return enriched;
  }
});
```

### Read Model Synchronization

```
Write Side (Command Handler):
1. Receive CreateOrderCommand
2. Create order in MySQL
3. Publish OrderCreatedEvent to Kafka
                    ↓
Read Side (Event Handler):
1. Consume OrderCreatedEvent
2. Denormalize order data
3. Insert into MongoDB read model
4. Next query gets fresh data

Timeline:
T=0ms:    Command received
T=1ms:    MySQL write complete, event published
T=10ms:   Event consumed by read handler
T=11ms:   MongoDB updated
T=12ms:   Next query sees new data
```

### Benefits Realized

```
Before CQRS (single model):
- Queries need complex joins
- Query slow because of write model structure
- Can't optimize independently
- Scale writes and reads together (expensive)

After CQRS:
- Read model optimized for queries
- No joins needed
- MongoDB fast for reads
- Can scale read replicas independently
- Different technologies for different needs
```

---

## Event-Driven Architecture

### Choreography vs Orchestration

#### Choreography: Services React to Events

```
Service A emits: OrderCreated
  ↓
Service B listens: "OrderCreated? I need to process payment"
  → Processes payment
  → Emits: PaymentProcessed
    ↓
Service C listens: "PaymentProcessed? I need to reserve inventory"
  → Reserves inventory
  → Emits: InventoryReserved
    ↓
Service D listens: "InventoryReserved? I need to ship"
  → Arranges shipping
  → Emits: ShippingArranged
```

**Pros:**
- Loose coupling
- Easy to add new services
- Each service independent

**Cons:**
- Hard to understand flow
- Difficult to debug (distributed logic)
- Events must be versioned carefully
- Can have circular dependencies

#### Orchestration: Central Coordinator

```
Central Saga Orchestrator:
1. Receive OrderCreated
2. Call PaymentService.processPayment()
3. If success, call InventoryService.reserve()
4. If success, call ShippingService.arrange()
5. If any fails, trigger compensations
6. Return result
```

**Pros:**
- Clear flow (explicit state machine)
- Easy to debug (centralized)
- Easy to track progress
- Easy to timeout/fail

**Cons:**
- Tight coupling to orchestrator
- Hard to extend with new steps
- Single point of failure

**This system uses:** Orchestration (Transaction Service orchestrates through Saga)

---

## Monitoring & Alerting Strategy

### Metrics to Track

#### Latency Metrics
```javascript
// Track request duration
const startTime = Date.now();
const result = await processTransaction(data);
const duration = Date.now() - startTime;

logger.info('Transaction processed', {
  duration,
  percentile: calculatePercentile(duration)  // p50, p95, p99
});

// Alert if p99 latency > 1 second
if (percentile99 > 1000) {
  sendAlert('High latency detected');
}
```

#### Error Rate
```javascript
// Track errors per service
const errorRate = (errorCount / totalRequests) * 100;

// Alert if error rate > 5%
if (errorRate > 5) {
  sendAlert(`High error rate: ${errorRate}%`);
}
```

#### Availability
```javascript
// Track uptime
const uptime = (successfulRequests / totalRequests) * 100;

// Alert if uptime < 99.9%
if (uptime < 99.9) {
  sendAlert(`Low availability: ${uptime}%`);
}
```

#### Resource Usage
```javascript
// Track database connections
const connectionUsage = (activeConnections / maxConnections) * 100;

// Alert if approaching limit
if (connectionUsage > 80) {
  sendAlert(`High connection usage: ${connectionUsage}%`);
}
```

### Dashboard Visualization

```
┌─────────────────────────────────────────────────────┐
│         System Health Dashboard                      │
├─────────────────────────────────────────────────────┤
│                                                      │
│ Status: HEALTHY                                      │
│ Uptime: 99.95%    Errors: 0.05%    Latency: 150ms  │
│                                                      │
│ Services:                                            │
│  ✓ API Gateway      (3000)  Up 1d 5h               │
│  ✓ User Service     (3001)  Up 2d 3h               │
│  ✓ Transaction Srv  (3003)  Up 1d 12h              │
│  ✓ Payment Service  (3004)  Up 3h (restarted)      │
│  ✗ Notification Srv (3005)  Down 15m               │
│                                                      │
│ Circuit Breakers:                                    │
│  User Service      [CLOSED]   Error Rate: 0.2%     │
│  Transaction Srv   [CLOSED]   Error Rate: 0.1%     │
│  Payment Service   [HALF_OPEN] Error Rate: 45%    │
│  Notification Srv  [OPEN]     Error Rate: 100%    │
│                                                      │
│ Database Pools:                                      │
│  MySQL: 15/20 connections ████████░░ 75%          │
│  MongoDB: 8/20 connections  ████░░░░░░ 40%         │
│                                                      │
│ Recent Alerts:                                       │
│  20:30 - Notification Service down (auto-recovery) │
│  19:45 - High memory usage on Payment Service      │
│  19:00 - Database failover completed                │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## Security Considerations

### Authentication & Authorization

```javascript
// JWT Token issued on login
const token = jwt.sign({
  userId: user.id,
  email: user.email,
  role: user.role
}, SECRET_KEY, { expiresIn: '24h' });

// Middleware validates token
app.use((req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Unauthorized' });
  }
});

// Authorization check
app.post('/admin/users', (req, res) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  // Process request
});
```

### Data Encryption

```javascript
// Sensitive data encrypted at rest
const hashedPassword = bcrypt.hashSync(password, 10);

// Connection to database encrypted in transit
const connection = await mysql.createConnection({
  host: 'localhost',
  ssl: 'require',  // Force SSL/TLS
  password: encryptedPassword
});

// Secrets never logged
logger.info('User created', {
  userId: user.id,
  email: user.email
  // password NOT logged
});
```

### Rate Limiting for Security

```javascript
// Brute force protection
const loginRateLimiter = new RateLimiter({
  windowMs: 900000,      // 15 minutes
  maxRequests: 5,        // Max 5 login attempts
  keyGenerator: (req) => req.body.email  // Per email, not IP
});

app.post('/login', loginRateLimiter, async (req, res) => {
  // Process login
});

// If attacker tries 6 logins in 15 min: blocked
```

