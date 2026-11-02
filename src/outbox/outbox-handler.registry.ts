import { Injectable } from '@nestjs/common';
import type { OutboxHandler } from './outbox.types.js';

/** Modules register their handlers here (from `onModuleInit`); the dispatcher looks them up. */
@Injectable()
export class OutboxHandlerRegistry {
  private readonly handlers: OutboxHandler[] = [];

  register(handler: OutboxHandler): void {
    this.handlers.push(handler);
  }

  handlersFor(type: string): OutboxHandler[] {
    return this.handlers.filter((handler) =>
      handler.types.some((pattern) =>
        pattern.endsWith('*')
          ? type.startsWith(pattern.slice(0, -1))
          : pattern === type,
      ),
    );
  }
}
