import { EventEmitter } from 'events';

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

    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.successCount = 0;
    this.requestCount = 0;
    this.nextAttempt = Date.now();
    this.resetTimeoutId = null;

    // Start monitoring
    this.startMonitoring();
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

      // Set timeout to transition to HALF_OPEN
      this.resetTimeoutId = setTimeout(() => {
        this.state = 'HALF_OPEN';
        this.emit('halfOpen');
      }, this.options.resetTimeout);
    }
  }

  startMonitoring() {
    setInterval(() => {
      // Reset counters periodically
      this.failureCount = Math.floor(this.failureCount * 0.9);
      this.successCount = Math.floor(this.successCount * 0.9);
      this.requestCount = Math.floor(this.requestCount * 0.9);
    }, this.options.monitoringPeriod);
  }

  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      requestCount: this.requestCount,
      failureRate: this.requestCount > 0 ? (this.failureCount / this.requestCount) * 100 : 0
    };
  }
}

export default CircuitBreaker;