import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { UserKind } from '../../generated/prisma/client.js';
import { DomainError } from '../errors/domain-error.js';
import { ErrorCode } from '../errors/error-codes.js';

export interface TenantState {
  userId: string;
  kind: UserKind;
  companyId?: string;
  /** True when a super admin is acting on a company: audit logs record it. */
  actingAs: boolean;
}

const KEY = 'tenant';

/** Request-scoped identity and company, on top of nestjs-cls. Never filled from client input. */
@Injectable()
export class TenantContext {
  constructor(private readonly cls: ClsService) {}

  set(state: TenantState) {
    this.cls.set(KEY, state);
  }

  get(): TenantState | undefined {
    return this.cls.get<TenantState | undefined>(KEY);
  }

  requireCompanyId(): string {
    const companyId = this.get()?.companyId;
    if (!companyId) {
      throw new DomainError(
        ErrorCode.CompanyContextRequired,
        'This request is not scoped to a company',
      );
    }
    return companyId;
  }
}
