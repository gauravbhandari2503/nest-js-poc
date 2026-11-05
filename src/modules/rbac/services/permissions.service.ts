import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { PrismaService } from '../../../infra/prisma/prisma.service.js';
import { REDIS } from '../../../infra/redis/redis.module.js';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.js';
import {
  ALL_PERMISSIONS,
  type PermissionCode,
} from '../../../common/auth/permissions.js';

export const PERMISSIONS_CACHE_TTL_SECONDS = 60;
const cacheKey = (userId: string) => `permissions:${userId}`;

/**
 * The one answer to "what may this user do on company routes?". The permission guard
 * and `GET /v1/auth/me` (which the frontend uses to hide menus) both call it, so what
 * the UI shows and what the server allows cannot drift apart.
 *
 * - SUPER_ADMIN: every permission (they may act on any company).
 * - STAFF: the permissions of their role; none if they are deactivated.
 * - CLIENT: none.
 *
 * Staff answers are cached in Redis for 60 s, so a role change or deactivation takes
 * effect within a minute at the latest. Code that changes a role, a role's permissions
 * or a staff member's active state calls `evict(userId)` to make it immediate.
 */
@Injectable()
export class PermissionsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async forUser(user: AuthenticatedUser): Promise<ReadonlySet<PermissionCode>> {
    if (user.kind === 'SUPER_ADMIN') return new Set(ALL_PERMISSIONS);
    if (user.kind !== 'STAFF') return new Set();

    const cached = await this.readCache(user.id);
    if (cached) return cached;

    const codes = await this.load(user.id);
    await this.writeCache(user.id, codes);
    return codes;
  }

  async evict(userId: string): Promise<void> {
    try {
      await this.redis.del(cacheKey(userId));
    } catch {
      // The entry expires within 60 s anyway.
    }
  }

  private async load(userId: string): Promise<ReadonlySet<PermissionCode>> {
    const staff = await this.prisma.companyStaff.findUnique({
      where: { userId },
      select: {
        deactivatedAt: true,
        role: {
          select: {
            permissions: { select: { permission: { select: { code: true } } } },
          },
        },
      },
    });
    if (!staff || staff.deactivatedAt) return new Set();
    return new Set(
      staff.role.permissions.map((rp) => rp.permission.code as PermissionCode),
    );
  }

  // Redis being down must not lock everyone out: fall back to the database.
  private async readCache(
    userId: string,
  ): Promise<ReadonlySet<PermissionCode> | null> {
    try {
      const raw = await this.redis.get(cacheKey(userId));
      return raw ? new Set(JSON.parse(raw) as PermissionCode[]) : null;
    } catch {
      return null;
    }
  }

  private async writeCache(
    userId: string,
    codes: ReadonlySet<PermissionCode>,
  ): Promise<void> {
    try {
      await this.redis.set(
        cacheKey(userId),
        JSON.stringify([...codes]),
        'EX',
        PERMISSIONS_CACHE_TTL_SECONDS,
      );
    } catch {
      // Cache is an optimisation only.
    }
  }
}
