import { Module } from '@nestjs/common';
import { CoreModule } from './core.module.js';
import { OutboxDispatcher } from './outbox/outbox-dispatcher.js';
import { OutboxModule } from './outbox/outbox.module.js';

/** Root module of the worker process: shared infrastructure, the outbox dispatcher, and (later) queue processors. */
@Module({
  imports: [CoreModule, OutboxModule],
  providers: [OutboxDispatcher],
})
export class WorkerModule {}
