import { Injectable } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error.js';
import { ErrorCode } from '../../../common/errors/error-codes.js';
import { PrismaService } from '../../../infra/prisma/prisma.service.js';
import { type AuditActor, AuditService } from '../../audit/index.js';
import type { CompanyDto } from '../dto/company.dto.js';
import { toCompanyDto } from '../dto/company.mapper.js';

@Injectable()
export class CompanyRegistrationFeeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Records that the company paid its one-time registration fee at the office. Marks the
   * company and adds the `REGISTRATION_FEE` platform-income entry in one transaction.
   * It can be recorded once: the conditional update is the lock against double entries.
   */
  async record(
    actor: AuditActor,
    companyId: string,
    ip?: string,
  ): Promise<CompanyDto> {
    return this.prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({ where: { id: companyId } });
      if (!company) {
        throw new DomainError(ErrorCode.NotFound, 'Company not found');
      }
      const paidAt = new Date();
      const claimed = await tx.company.updateMany({
        where: { id: companyId, registrationFeePaidAt: null },
        data: { registrationFeePaidAt: paidAt },
      });
      if (claimed.count === 0) {
        throw new DomainError(
          ErrorCode.InvalidStateTransition,
          'The registration fee was already recorded for this company',
        );
      }
      if (company.registrationFee > 0) {
        await tx.ledgerEntry.create({
          data: {
            account: 'PLATFORM_INCOME',
            entryType: 'REGISTRATION_FEE',
            companyId,
            amount: company.registrationFee,
            memo: 'Registration fee',
            createdBy: actor.id,
          },
        });
      }
      await this.audit.record(tx, {
        actor,
        companyId,
        module: 'companies',
        action: 'company.registration_fee_recorded',
        entityType: 'company',
        entityId: companyId,
        after: {
          registrationFee: company.registrationFee,
          registrationFeePaidAt: paidAt.toISOString(),
        },
        ip,
      });
      return toCompanyDto({ ...company, registrationFeePaidAt: paidAt });
    });
  }
}
