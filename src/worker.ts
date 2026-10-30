import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { CoreModule } from './core.module.js';

/**
 * Separate process for BullMQ processors and cron jobs.
 * Register processor modules here as queues are added.
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(CoreModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
}
await bootstrap();
