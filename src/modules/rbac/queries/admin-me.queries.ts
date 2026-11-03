import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.js';
import { PermissionsService } from '../services/permissions.service.js';
import { DomainError } from '../../../common/errors/domain-error.js';
import { ErrorCode } from '../../../common/errors/error-codes.js';
import { PrismaService } from '../../../infra/prisma/prisma.service.js';
import type { AdminMeDto } from '../dto/admin-me.dto.js';

@Injectable()
export class AdminMeQueries {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  async get(
    user: AuthenticatedUser,
    companyId: string | undefined,
  ): Promise<AdminMeDto> {
    const [profile, company, held] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: user.id },
        select: { id: true, email: true, fullName: true, kind: true },
      }),
      companyId
        ? this.prisma.company.findUnique({
            where: { id: companyId },
            select: { id: true, name: true },
          })
        : null,
      this.permissions.forUser(user),
    ]);
    if (!profile || (companyId && !company)) {
      throw new DomainError(ErrorCode.NotFound, 'Account not found');
    }
    return { ...profile, company, permissions: [...held].sort() };
  }
}
