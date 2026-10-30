import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthenticatedUser } from './authenticated-user.js';
import { ALL_PERMISSIONS, type PermissionCode } from './permissions.js';

/**
 * The one answer to "what may this user do on company routes?". The permission guard
 * and `GET /v1/admin/me` (which the frontend uses to hide menus) both call it, so what
 * the UI shows and what the server allows cannot drift apart.
 *
 * - SUPER_ADMIN: every permission (they may act on any company).
 * - STAFF: the permissions of their role; none if they are deactivated.
 * - CLIENT: none.
 *
 * TODO milestone 1: cache per user in Redis (60 s TTL, evicted when roles change).
 */
@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async forUser(user: AuthenticatedUser): Promise<ReadonlySet<PermissionCode>> {
    if (user.kind === 'SUPER_ADMIN') return new Set(ALL_PERMISSIONS);
    if (user.kind !== 'STAFF') return new Set();

    const staff = await this.prisma.companyStaff.findUnique({
      where: { userId: user.id },
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
}
