import { Controller, Get, Inject } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorService,
} from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import { PrismaService } from '../prisma/prisma.service.js';
import { REDIS } from '../redis/redis.module.js';

@ApiExcludeController()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly indicator: HealthIndicatorService,
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      async () => {
        const session = this.indicator.check('postgres');
        try {
          await this.prisma.$queryRaw`SELECT 1`;
          return session.up();
        } catch (error) {
          return session.down({ message: (error as Error).message });
        }
      },
      async () => {
        const session = this.indicator.check('redis');
        try {
          await this.redis.ping();
          return session.up();
        } catch (error) {
          return session.down({ message: (error as Error).message });
        }
      },
    ]);
  }
}
