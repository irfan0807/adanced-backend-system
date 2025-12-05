class Bulkhead {
  constructor(options = {}) {
    this.pools = new Map();
    this.defaultPoolSize = options.defaultPoolSize || 10;
    this.queueTimeout = options.queueTimeout || 30000;
  }

  createPool(name, size = this.defaultPoolSize) {
    if (this.pools.has(name)) {
      return this.pools.get(name);
    }

    const pool = {
      name,
      size,
      active: 0,
      queue: [],
      stats: {
        totalRequests: 0,
        completedRequests: 0,
        failedRequests: 0,
        queuedRequests: 0,
        rejectedRequests: 0
      }
    };

    this.pools.set(name, pool);
    return pool;
  }

  async execute(poolName, operation, options = {}) {
    const pool = this.pools.get(poolName) || this.createPool(poolName);
    const timeout = options.timeout || this.queueTimeout;

    pool.stats.totalRequests++;

    return new Promise((resolve, reject) => {
      const task = {
        operation,
        resolve,
        reject,
        timestamp: Date.now(),
        timeout: setTimeout(() => {
          this.removeFromQueue(pool, task);
          pool.stats.rejectedRequests++;
          reject(new Error(`Bulkhead timeout for pool ${poolName}`));
        }, timeout)
      };

      if (pool.active < pool.size) {
        this.executeTask(pool, task);
      } else {
        pool.queue.push(task);
        pool.stats.queuedRequests++;
      }
    });
  }

  async executeTask(pool, task) {
    clearTimeout(task.timeout);
    pool.active++;

    try {
      const result = await task.operation();
      pool.stats.completedRequests++;
      task.resolve(result);
    } catch (error) {
      pool.stats.failedRequests++;
      task.reject(error);
    } finally {
      pool.active--;
      this.processQueue(pool);
    }
  }

  processQueue(pool) {
    if (pool.queue.length > 0 && pool.active < pool.size) {
      const task = pool.queue.shift();
      if (task) {
        pool.stats.queuedRequests--;
        this.executeTask(pool, task);
      }
    }
  }

  removeFromQueue(pool, taskToRemove) {
    const index = pool.queue.indexOf(taskToRemove);
    if (index > -1) {
      pool.queue.splice(index, 1);
      pool.stats.queuedRequests--;
    }
  }

  getStats(poolName) {
    const pool = this.pools.get(poolName);
    if (!pool) return null;

    return {
      ...pool.stats,
      active: pool.active,
      queued: pool.queue.length,
      capacity: pool.size,
      utilization: (pool.active / pool.size) * 100
    };
  }

  getAllStats() {
    const stats = {};
    for (const [name, pool] of this.pools) {
      stats[name] = this.getStats(name);
    }
    return stats;
  }
}

export default Bulkhead;