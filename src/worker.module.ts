import { Module } from '@nestjs/common';
import { CoreModule } from './core.module.js';
import { IdentityJobsModule } from './modules/identity/index.js';
import { OutboxDispatcher } from './infra/outbox/outbox-dispatcher.js';
import { OutboxModule } from './infra/outbox/outbox.module.js';

/** Root module of the worker process: shared infrastructure, the outbox dispatcher, and (later) queue processors. */
@Module({
  imports: [CoreModule, OutboxModule, IdentityJobsModule],
  providers: [OutboxDispatcher],
})
export class WorkerModule {}
