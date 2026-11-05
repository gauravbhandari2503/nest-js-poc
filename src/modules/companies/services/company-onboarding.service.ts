import { Injectable } from '@nestjs/common';
import { SystemRole } from '../../../common/auth/permissions.js';
import { DomainError } from '../../../common/errors/domain-error.js';
import { ErrorCode } from '../../../common/errors/error-codes.js';
import { OutboxService } from '../../../infra/outbox/outbox.service.js';
import { PrismaService } from '../../../infra/prisma/prisma.service.js';
import { type AuditActor, AuditService } from '../../audit/index.js';
import { SET_PASSWORD_REQUESTED } from '../../identity/index.js';
import { resolveEmployeeId } from '../../rbac/index.js';
import { bpsToPercent, percentToBps } from '../domain/commission.js';
import { slugify } from '../domain/company-slug.js';
import type { OnboardedCompanyDto } from '../dto/company.dto.js';
import { toCompanyDto } from '../dto/company.mapper.js';
import type { OnboardCompanyDto } from '../dto/onboard-company.dto.js';

@Injectable()
export class CompanyOnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  /**
   * Creates the company, its owner (`INVITED`, no password yet) and the owner's staff
   * record in one transaction, with the audit entry and the "set your password" email
   * event. The email goes out through the outbox, so a mail outage cannot undo onboarding.
   */
  async onboard(
    actor: AuditActor,
    dto: OnboardCompanyDto,
    ip?: string,
  ): Promise<OnboardedCompanyDto> {
    const slug = dto.slug ?? slugify(dto.name);
    if (!slug) {
      throw new DomainError(
        ErrorCode.ValidationFailed,
        'Request validation failed',
        {
          errors: [
            {
              field: 'name',
              message: 'must contain letters or digits to make a slug from',
            },
          ],
        },
      );
    }
    await this.assertFree(dto.owner.email, slug);

    const ownerRole = await this.prisma.role.findFirstOrThrow({
      where: { name: SystemRole.CompanyOwner, companyId: null },
      select: { id: true },
    });

    const created = await this.prisma
      .$transaction(async (tx) => {
        const company = await tx.company.create({
          data: {
            name: dto.name,
            slug,
            salesCommissionBps: percentToBps(dto.salesCommissionPercent),
            membershipCommissionBps: percentToBps(
              dto.membershipCommissionPercent,
            ),
            registrationFee: dto.registrationFee,
            cancellationPolicy: dto.cancellationPolicy,
            refundPolicy: dto.refundPolicy,
            onboardedBy: actor.id,
          },
        });
        const user = await tx.user.create({
          data: {
            kind: 'STAFF',
            email: dto.owner.email,
            fullName: dto.owner.fullName,
            phone: dto.owner.phone,
            status: 'INVITED',
          },
        });
        const employeeId = resolveEmployeeId(dto.owner.employeeId, user.id);
        await tx.companyStaff.create({
          data: {
            companyId: company.id,
            userId: user.id,
            roleId: ownerRole.id,
            employeeId,
            isOwner: true,
          },
        });
        await this.audit.record(tx, {
          actor,
          companyId: company.id,
          module: 'companies',
          action: 'company.onboarded',
          entityType: 'company',
          entityId: company.id,
          after: {
            name: company.name,
            slug: company.slug,
            salesCommissionPercent: bpsToPercent(company.salesCommissionBps),
            membershipCommissionPercent: bpsToPercent(
              company.membershipCommissionBps,
            ),
            registrationFee: company.registrationFee,
            owner: { userId: user.id, email: user.email, employeeId },
          },
          ip,
        });
        await this.outbox.add(tx, {
          type: SET_PASSWORD_REQUESTED,
          aggregateId: user.id,
          data: { userId: user.id, companyName: company.name },
        });
        return { company, user, employeeId };
      })
      .catch(async (error: { code?: string }) => {
        // Two onboardings racing past the check above: report which value was taken.
        if (error.code === 'P2002')
          await this.assertFree(dto.owner.email, slug);
        throw error;
      });

    const { company, user, employeeId } = created;
    return {
      company: toCompanyDto(company),
      owner: {
        userId: user.id,
        email: user.email,
        fullName: user.fullName,
        employeeId,
        status: user.status,
      },
    };
  }

  private async assertFree(email: string, slug: string): Promise<void> {
    const [company, user] = await Promise.all([
      this.prisma.company.findUnique({ where: { slug }, select: { id: true } }),
      this.prisma.user.findUnique({ where: { email }, select: { id: true } }),
    ]);
    if (company) {
      throw new DomainError(
        ErrorCode.CompanySlugTaken,
        'A company with this slug already exists',
      );
    }
    if (user) {
      throw new DomainError(
        ErrorCode.EmailTaken,
        'An account with this email already exists',
      );
    }
  }
}
