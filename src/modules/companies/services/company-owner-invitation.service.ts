import { Injectable } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error.js';
import { ErrorCode } from '../../../common/errors/error-codes.js';
import { OutboxService } from '../../../infra/outbox/outbox.service.js';
import { PrismaService } from '../../../infra/prisma/prisma.service.js';
import { type AuditActor, AuditService } from '../../audit/index.js';
import { SET_PASSWORD_REQUESTED } from '../../identity/index.js';

@Injectable()
export class CompanyOwnerInvitationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  /**
   * Sends the owner a fresh "set your password" email, for an owner who has not set one
   * yet (lost or expired link). The worker issues the new token, which also retires the
   * old link. An owner who already has a password uses "forgot password" instead.
   */
  async resend(
    actor: AuditActor,
    companyId: string,
    ip?: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({
        where: { id: companyId },
        select: {
          name: true,
          staff: {
            where: { isOwner: true },
            take: 1,
            select: {
              user: { select: { id: true, email: true, status: true } },
            },
          },
        },
      });
      const owner = company?.staff[0]?.user;
      if (!company || !owner) {
        throw new DomainError(ErrorCode.NotFound, 'Company owner not found');
      }
      if (owner.status !== 'INVITED') {
        throw new DomainError(
          ErrorCode.InvalidStateTransition,
          'The owner has already set a password. They can use "forgot password".',
        );
      }
      await this.audit.record(tx, {
        actor,
        companyId,
        module: 'companies',
        action: 'company.owner_invitation_resent',
        entityType: 'user',
        entityId: owner.id,
        after: { email: owner.email },
        ip,
      });
      await this.outbox.add(tx, {
        type: SET_PASSWORD_REQUESTED,
        aggregateId: owner.id,
        data: { userId: owner.id, companyName: company.name },
      });
    });
  }
}
