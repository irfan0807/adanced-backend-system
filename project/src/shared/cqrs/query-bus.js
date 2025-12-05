import { EventEmitter } from 'events';

class QueryBus extends EventEmitter {
  constructor() {
    super();
    this.handlers = new Map();
    this.middlewares = [];
  }

  registerHandler(queryType, handler) {
    if (this.handlers.has(queryType)) {
      throw new Error(`Handler for query type ${queryType} already registered`);
    }
    this.handlers.set(queryType, handler);
  }

  addMiddleware(middleware) {
    this.middlewares.push(middleware);
  }

  async execute(query) {
    const queryType = query.constructor.name;
    const handler = this.handlers.get(queryType);

    if (!handler) {
      throw new Error(`No handler registered for query type: ${queryType}`);
    }

    // Execute middlewares
    let context = { query };
    for (const middleware of this.middlewares) {
      context = await middleware(context) || context;
    }

    try {
      this.emit('queryExecuting', { query: context.query, timestamp: new Date() });
      
      const result = await handler.handle(context.query);
      
      this.emit('queryExecuted', { query: context.query, result, timestamp: new Date() });
      
      return result;
    } catch (error) {
      this.emit('queryFailed', { query: context.query, error, timestamp: new Date() });
      throw error;
    }
  }
}

export default QueryBus;