import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { UserKind, Prisma } from '../../../generated/prisma/client.js';

export interface AuditActor {
  id: string;
  kind: UserKind;
}

export interface AuditEntry {
  actor: AuditActor;
  /** The company the change belongs to; null for platform-level changes. */
  companyId?: string | null;
  /** Owning module, e.g. `companies`. */
  module: string;
  /** Dotted verb, e.g. `company.onboarded`. */
  action: string;
  entityType: string;
  entityId: string;
  /** Facts before and after. Never put passwords, tokens or card data here. */
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  ip?: string | null;
}

/**
 * Writes `audit_logs` **inside the caller's transaction**, so an audited change and its
 * record commit or roll back together. Every platform and admin write calls it.
 */
@Injectable()
export class AuditService {
  constructor(private readonly cls: ClsService) {}

  async record(tx: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
    await tx.auditLog.create({
      data: {
        actorId: entry.actor.id,
        actorKind: entry.actor.kind,
        companyId: entry.companyId ?? null,
        module: entry.module,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        before: entry.before ?? undefined,
        after: entry.after ?? undefined,
        correlationId: this.cls.getId() ?? 'none',
        ip: entry.ip ?? null,
      },
    });
  }
}
