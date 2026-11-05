import { Module } from '@nestjs/common';
import { PlatformAuditController } from './controllers/platform-audit.controller.js';
import { PlatformAuditQueries } from './queries/platform-audit.queries.js';
import { AuditService } from './services/audit.service.js';

@Module({
  controllers: [PlatformAuditController],
  providers: [AuditService, PlatformAuditQueries],
  exports: [AuditService],
})
export class AuditModule {}
