import { Injectable } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error.js';
import { ErrorCode } from '../../../common/errors/error-codes.js';
import { PrismaService } from '../../../infra/prisma/prisma.service.js';
import { type AuditActor, AuditService } from '../../audit/index.js';
import { planCompanyUpdate } from '../domain/company-update.js';
import type { CompanyDto } from '../dto/company.dto.js';
import { toCompanyDto } from '../dto/company.mapper.js';
import type { UpdateCompanyDto } from '../dto/update-company.dto.js';

@Injectable()
export class CompanyRatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Changes commission rates and/or suspends or reactivates a company. Past bookings keep
   * the rates they were made with. A request that changes nothing writes nothing.
   */
  async update(
    actor: AuditActor,
    companyId: string,
    dto: UpdateCompanyDto,
    ip?: string,
  ): Promise<CompanyDto> {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new DomainError(
        ErrorCode.ValidationFailed,
        'Request validation failed',
        {
          errors: [
            {
              field: 'body',
              message:
                'send at least one of salesCommissionPercent, membershipCommissionPercent, status',
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
      const plan = planCompanyUpdate(current, dto);
      if (!plan) return toCompanyDto(current);

      const updated = await tx.company.update({
        where: { id: companyId },
        data: plan.data,
      });
      await this.audit.record(tx, {
        actor,
        companyId,
        module: 'companies',
        action: 'company.updated',
        entityType: 'company',
        entityId: companyId,
        before: plan.before as Record<string, string | number>,
        after: plan.after as Record<string, string | number>,
        ip,
      });
      return toCompanyDto(updated);
    });
  }
}
