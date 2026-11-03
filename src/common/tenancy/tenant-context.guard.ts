import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isUUID } from 'class-validator';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { COMPANY_HEADER } from '../auth/authenticated-user.js';
import {
  ALLOWED_KINDS_KEY,
  COMPANY_OPTIONAL_KEY,
  IS_PUBLIC_KEY,
  type TenantRequest,
} from '../auth/auth.decorators.js';
import { DomainError } from '../errors/domain-error.js';
import { ErrorCode } from '../errors/error-codes.js';
import { TenantContext } from './tenant-context.js';

/**
 * Decides which company a request acts on. This is the only place that does it.
 *
 * - STAFF: the company in their token. The header is ignored, so staff can never reach
 *   another company.
 * - SUPER_ADMIN on a company route: the company in `X-Company-Id` (400 if missing or not a
 *   uuid, 404 if it does not exist). Routes marked `@CompanyOptional()` accept a missing
 *   header and run with no company.
 * - Anything else on a company route: 403.
 *
 * Services receive `companyId` as a plain parameter and cannot tell the two apart.
 */
@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenant: TenantContext,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (
      this.reflector.getAllAndOverride<boolean | undefined>(
        IS_PUBLIC_KEY,
        targets,
      )
    ) {
      return true;
    }
    const request = context
      .switchToHttp()
      .getRequest<TenantRequest & { headers: Record<string, unknown> }>();
    const user = request.user;
    if (!user) {
      throw new DomainError(
        ErrorCode.Unauthenticated,
        'Authentication required',
      );
    }

    const kinds = this.reflector.getAllAndOverride<string[] | undefined>(
      ALLOWED_KINDS_KEY,
      targets,
    );
    const isCompanyRoute = kinds?.includes('STAFF') ?? false;

    if (!isCompanyRoute) {
      this.tenant.set({ userId: user.id, kind: user.kind, actingAs: false });
      return true;
    }

    let companyId: string;
    let actingAs = false;
    if (user.kind === 'STAFF') {
      if (!user.companyId) {
        throw new DomainError(
          ErrorCode.Forbidden,
          'Staff token has no company',
        );
      }
      companyId = user.companyId;
    } else if (user.kind === 'SUPER_ADMIN') {
      const header = request.headers[COMPANY_HEADER];
      if (
        header === undefined &&
        this.reflector.getAllAndOverride<boolean | undefined>(
          COMPANY_OPTIONAL_KEY,
          targets,
        )
      ) {
        this.tenant.set({ userId: user.id, kind: user.kind, actingAs: false });
        return true;
      }
      if (typeof header !== 'string' || !isUUID(header)) {
        throw new DomainError(
          ErrorCode.CompanyContextRequired,
          'Send the company to act on in the X-Company-Id header',
        );
      }
      const company = await this.prisma.company.findUnique({
        where: { id: header },
        select: { id: true },
      });
      if (!company)
        throw new DomainError(ErrorCode.NotFound, 'Company not found');
      companyId = company.id;
      actingAs = true;
    } else {
      throw new DomainError(
        ErrorCode.Forbidden,
        'Not allowed on company routes',
      );
    }

    request.companyId = companyId;
    this.tenant.set({ userId: user.id, kind: user.kind, companyId, actingAs });
    return true;
  }
}
