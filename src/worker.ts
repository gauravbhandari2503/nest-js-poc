import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { WorkerModule } from './worker.module.js';

/**
 * Separate process for BullMQ processors, cron jobs and the outbox dispatcher.
 * Register processor modules here as queues are added.
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
}
await bootstrap();
