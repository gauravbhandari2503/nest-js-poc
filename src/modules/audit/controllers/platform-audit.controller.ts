import { Controller, Get, Query } from '@nestjs/common';
import { PlatformApi } from '../../../common/auth/surfaces.js';
import type { Page } from '../../../common/utils/pagination/index.js';
import { AuditLogQueryDto } from '../dto/audit-log-query.dto.js';
import type { AuditLogDto } from '../dto/audit-log.dto.js';
import { PlatformAuditQueries } from '../queries/platform-audit.queries.js';

@PlatformApi()
@Controller('v1/platform/audit-logs')
export class PlatformAuditController {
  constructor(private readonly queries: PlatformAuditQueries) {}

  /** Newest first. Filters: companyId, actorId, module, action, entityType, entityId, from, to. */
  @Get()
  search(@Query() query: AuditLogQueryDto): Promise<Page<AuditLogDto>> {
    return this.queries.search(query);
  }
}
