import { randomUUID } from 'node:crypto';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { ClsModule, ClsService } from 'nestjs-cls';
import { LoggerModule } from 'nestjs-pino';
import { type Env, validateEnv } from './config/env.js';
import { MailModule } from './mail/mail.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RedisModule } from './redis/redis.module.js';

/** Infrastructure shared by the HTTP app and the worker process. */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        generateId: true,
        idGenerator: (req: { headers: Record<string, unknown> }) =>
          (req.headers['x-correlation-id'] as string | undefined) ??
          randomUUID(),
      },
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService, ClsService],
      useFactory: (config: ConfigService<Env, true>, cls: ClsService) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          customProps: () => ({ correlationId: cls.getId() }),
          transport:
            config.get('NODE_ENV', { infer: true }) === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        // BullMQ workers require maxRetriesPerRequest to be null.
        connection: new Redis(config.get('REDIS_URL', { infer: true }), {
          maxRetriesPerRequest: null,
        }),
      }),
    }),
    RedisModule,
    PrismaModule,
    MailModule,
  ],
})
export class CoreModule {}
