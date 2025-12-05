import Redis from 'ioredis';

class RateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 900000; // 15 minutes
    this.maxRequests = options.maxRequests || 100;
    this.redis = new Redis(process.env.REDIS_HOST || 'localhost:6379');
  }

  async isAllowed(key, cost = 1) {
    const now = Date.now();
    const window = Math.floor(now / this.windowMs);
    const redisKey = `rate_limit:${key}:${window}`;

    try {
      const current = await this.redis.get(redisKey);
      const currentCount = parseInt(current || '0');

      if (currentCount + cost > this.maxRequests) {
        return {
          allowed: false,
          remaining: Math.max(0, this.maxRequests - currentCount),
          resetTime: (window + 1) * this.windowMs,
          cost
        };
      }

      // Increment counter
      const pipeline = this.redis.pipeline();
      pipeline.incrby(redisKey, cost);
      pipeline.expire(redisKey, Math.ceil(this.windowMs / 1000));
      await pipeline.exec();

      return {
        allowed: true,
        remaining: Math.max(0, this.maxRequests - currentCount - cost),
        resetTime: (window + 1) * this.windowMs,
        cost
      };
    } catch (error) {
      console.error('Rate limiter error:', error);
      // Fail open - allow request if Redis is down
      return { allowed: true, remaining: this.maxRequests, resetTime: now + this.windowMs };
    }
  }

  // Sliding window log implementation
  async slidingWindowLog(key, cost = 1) {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const redisKey = `sliding_window:${key}`;

    try {
      // Remove expired entries and count current requests
      const pipeline = this.redis.pipeline();
      pipeline.zremrangebyscore(redisKey, '-inf', windowStart);
      pipeline.zcard(redisKey);
      
      const results = await pipeline.exec();
      const currentCount = results[1][1];

      if (currentCount + cost > this.maxRequests) {
        return {
          allowed: false,
          remaining: Math.max(0, this.maxRequests - currentCount),
          resetTime: now + this.windowMs
        };
      }

      // Add current request(s)
      const requests = [];
      for (let i = 0; i < cost; i++) {
        requests.push(now + i, `${now}-${i}`);
      }
      
      await this.redis.zadd(redisKey, ...requests);
      await this.redis.expire(redisKey, Math.ceil(this.windowMs / 1000));

      return {
        allowed: true,
        remaining: Math.max(0, this.maxRequests - currentCount - cost),
        resetTime: now + this.windowMs
      };
    } catch (error) {
      console.error('Sliding window rate limiter error:', error);
      return { allowed: true, remaining: this.maxRequests, resetTime: now + this.windowMs };
    }
  }
}

export default RateLimiter;