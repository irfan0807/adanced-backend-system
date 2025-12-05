import { EventEmitter } from 'events';

class CommandBus extends EventEmitter {
  constructor() {
    super();
    this.handlers = new Map();
    this.middlewares = [];
  }

  registerHandler(commandType, handler) {
    if (this.handlers.has(commandType)) {
      throw new Error(`Handler for command type ${commandType} already registered`);
    }
    this.handlers.set(commandType, handler);
  }

  addMiddleware(middleware) {
    this.middlewares.push(middleware);
  }

  async execute(command) {
    const commandType = command.constructor.name;
    const handler = this.handlers.get(commandType);

    if (!handler) {
      throw new Error(`No handler registered for command type: ${commandType}`);
    }

    // Execute middlewares
    let context = { command };
    for (const middleware of this.middlewares) {
      context = await middleware(context) || context;
    }

    try {
      this.emit('commandExecuting', { command: context.command, timestamp: new Date() });
      
      const result = await handler.handle(context.command);
      
      this.emit('commandExecuted', { command: context.command, result, timestamp: new Date() });
      
      return result;
    } catch (error) {
      this.emit('commandFailed', { command: context.command, error, timestamp: new Date() });
      throw error;
    }
  }
}

export default CommandBus;