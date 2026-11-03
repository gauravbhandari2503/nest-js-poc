import { ExpressAdapter } from '@bull-board/express';
import { BullBoardModule } from '@bull-board/nestjs';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { createObserveModule } from '@nestjs/observe';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import type { Redis } from 'ioredis';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from './common/auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from './common/auth/guards/permissions.guard.js';
import { TenantContextGuard } from './common/tenancy/tenant-context.guard.js';
import { IdentityModule } from './modules/identity/index.js';
import { RbacModule } from './modules/rbac/index.js';
import type { Env } from './config/env.validation.js';
import { ProblemDetailsFilter } from './common/filters/problem-details.filter.js';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor.js';
import { IdempotencyInterceptor } from './common/interceptors/idempotency.interceptor.js';
import { OutboxModule } from './infra/outbox/outbox.module.js';
import { TenancyModule } from './common/tenancy/tenancy.module.js';
import { CoreModule } from './core.module.js';
import { HealthModule } from './health/health.module.js';
import { REDIS } from './infra/redis/redis.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com
    ObserveModule.forRoot({
      appKey: 'YOUR_APP_KEY',
      appSecret: 'YOUR_APP_SECRET',
      serviceId: 'book-my-ticket',
    }),
    CoreModule,
    TenancyModule,
    OutboxModule,
    ThrottlerModule.forRootAsync({
      inject: [ConfigService, REDIS],
      useFactory: (config: ConfigService<Env, true>, redis: Redis) => ({
        throttlers: [
          {
            ttl: config.get('THROTTLE_TTL_MS', { infer: true }),
            limit: config.get('THROTTLE_LIMIT', { infer: true }),
          },
        ],
        storage: new ThrottlerStorageRedisService(redis),
      }),
    }),
    BullBoardModule.forRoot({ route: '/queues', adapter: ExpressAdapter }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
      }),
    }),
    HealthModule,
    IdentityModule,
    RbacModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    // Envelope first (outermost), so idempotency stores and replays the bare data.
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    // Order matters: throttle, authenticate, pick the company, then check permissions.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantContextGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
