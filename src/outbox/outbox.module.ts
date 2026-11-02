import { Global, Module } from '@nestjs/common';
import { OutboxHandlerRegistry } from './outbox-handler.registry.js';
import { OutboxService } from './outbox.service.js';

/** Writing side: any module can inject `OutboxService`. The dispatcher lives in `WorkerModule`. */
@Global()
@Module({
  providers: [OutboxService, OutboxHandlerRegistry],
  exports: [OutboxService, OutboxHandlerRegistry],
})
export class OutboxModule {}
