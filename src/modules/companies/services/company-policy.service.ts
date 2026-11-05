import { Injectable } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error.js';
import { ErrorCode } from '../../../common/errors/error-codes.js';
import { PrismaService } from '../../../infra/prisma/prisma.service.js';
import { type AuditActor, AuditService } from '../../audit/index.js';
import type { AdminCompanyDto } from '../dto/company.dto.js';
import { toAdminCompanyDto } from '../dto/company.mapper.js';
import type { UpdateCompanyPolicyDto } from '../dto/update-company-policy.dto.js';

@Injectable()
export class CompanyPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** The company edits the cancellation and refund text customers see before booking. */
  async update(
    actor: AuditActor,
    companyId: string,
    dto: UpdateCompanyPolicyDto,
    ip?: string,
  ): Promise<AdminCompanyDto> {
    if (
      dto.cancellationPolicy === undefined &&
      dto.refundPolicy === undefined
    ) {
      throw new DomainError(
        ErrorCode.ValidationFailed,
        'Request validation failed',
        {
          errors: [
            {
              field: 'body',
              message: 'send cancellationPolicy and/or refundPolicy',
            },
          ],
        },
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.company.findUnique({ where: { id: companyId } });
      if (!current) {
        throw new DomainError(ErrorCode.NotFound, 'Company not found');
      }
      const before: Record<string, string> = {};
      const after: Record<string, string> = {};
      for (const field of ['cancellationPolicy', 'refundPolicy'] as const) {
        const next = dto[field];
        if (next !== undefined && next !== current[field]) {
          before[field] = current[field];
          after[field] = next;
        }
      }
      if (Object.keys(after).length === 0) return toAdminCompanyDto(current);

      const updated = await tx.company.update({
        where: { id: companyId },
        data: after,
      });
      await this.audit.record(tx, {
        actor,
        companyId,
        module: 'companies',
        action: 'company.policy_updated',
        entityType: 'company',
        entityId: companyId,
        before,
        after,
        ip,
      });
      return toAdminCompanyDto(updated);
    });
  }
}
