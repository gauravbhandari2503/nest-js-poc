import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.js';
import { DomainError } from '../../../common/errors/domain-error.js';
import { ErrorCode } from '../../../common/errors/error-codes.js';
import { PrismaService } from '../../../infra/prisma/prisma.service.js';
import type { MeDto } from '../dto/me.dto.js';
import { PermissionsService } from '../services/permissions.service.js';

@Injectable()
export class MeQueries {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  async get(user: AuthenticatedUser): Promise<MeDto> {
    const [profile, staff, held] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: user.id },
        select: {
          id: true,
          email: true,
          fullName: true,
          phone: true,
          kind: true,
        },
      }),
      user.kind === 'STAFF'
        ? this.prisma.companyStaff.findUnique({
            where: { userId: user.id },
            select: {
              employeeId: true,
              isOwner: true,
              company: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  status: true,
                  cancellationPolicy: true,
                  refundPolicy: true,
                },
              },
            },
          })
        : null,
      this.permissions.forUser(user),
    ]);
    if (!profile) {
      throw new DomainError(ErrorCode.NotFound, 'Account not found');
    }
    return {
      ...profile,
      employeeId: staff?.employeeId ?? null,
      isOwner: staff?.isOwner ?? false,
      company: staff?.company ?? null,
      permissions: [...held].sort(),
    };
  }
}
