class RetryWithBackoff {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.baseDelay = options.baseDelay || 1000;
    this.maxDelay = options.maxDelay || 30000;
    this.jitterMax = options.jitterMax || 100;
    this.exponentialBase = options.exponentialBase || 2;
  }

  async execute(operation, retryCondition = () => true) {
    let lastError;
    
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt === this.maxRetries || !retryCondition(error)) {
          throw error;
        }

        const delay = this.calculateDelay(attempt);
        console.log(`Retry attempt ${attempt + 1} after ${delay}ms delay. Error: ${error.message}`);
        
        await this.sleep(delay);
      }
    }
    
    throw lastError;
  }

  calculateDelay(attempt) {
    // Exponential backoff: baseDelay * (exponentialBase ^ attempt)
    const exponentialDelay = this.baseDelay * Math.pow(this.exponentialBase, attempt);
    
    // Add jitter to avoid thundering herd
    const jitter = Math.random() * this.jitterMax;
    
    // Cap at maxDelay
    return Math.min(exponentialDelay + jitter, this.maxDelay);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default RetryWithBackoff;