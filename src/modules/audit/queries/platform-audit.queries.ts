import { Injectable } from '@nestjs/common';
import {
  buildPage,
  dateSortKey,
  keysetOrderBy,
  keysetWhere,
  type Page,
  pageQueryLimit,
} from '../../../common/utils/pagination/index.js';
import { PrismaService } from '../../../infra/prisma/prisma.service.js';
import type { AuditLogQueryDto } from '../dto/audit-log-query.dto.js';
import type { AuditLogDto } from '../dto/audit-log.dto.js';

/** The audit log viewer: super admin only, across every company. */
@Injectable()
export class PlatformAuditQueries {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: AuditLogQueryDto): Promise<Page<AuditLogDto>> {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        AND: [
          query.companyId ? { companyId: query.companyId } : {},
          query.actorId ? { actorId: query.actorId } : {},
          query.module ? { module: query.module } : {},
          query.action ? { action: query.action } : {},
          query.entityType ? { entityType: query.entityType } : {},
          query.entityId ? { entityId: query.entityId } : {},
          query.from ? { occurredAt: { gte: new Date(query.from) } } : {},
          query.to ? { occurredAt: { lte: new Date(query.to) } } : {},
          keysetWhere(
            'occurredAt',
            query.decodedCursor(),
            'desc',
            (value) => new Date(value),
          ),
        ],
      },
      include: { actor: { select: { email: true, fullName: true } } },
      orderBy: keysetOrderBy('occurredAt', 'desc'),
      take: pageQueryLimit(query.limit),
    });

    return buildPage(
      rows.map((row): AuditLogDto => ({
        id: row.id,
        occurredAt: row.occurredAt,
        actor: {
          id: row.actorId,
          kind: row.actorKind,
          email: row.actor?.email ?? null,
          fullName: row.actor?.fullName ?? null,
        },
        companyId: row.companyId,
        module: row.module,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        before: row.before,
        after: row.after,
        correlationId: row.correlationId,
        ip: row.ip,
      })),
      query.limit,
      (row) => ({ sortKey: dateSortKey(row.occurredAt), id: row.id }),
    );
  }
}
