import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ALL_PERMISSIONS } from './permissions.js';

/**
 * Boot check: the `permissions` table must match the `Permission` constant in code.
 * A mismatch means the seed was not run after a deploy, and guards would silently
 * deny (or allow) the wrong things, so the app refuses to start instead.
 */
@Injectable()
export class PermissionsSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PermissionsSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    const rows = await this.prisma.permission.findMany({
      select: { code: true },
    });
    const inDb = new Set(rows.map((row) => row.code));
    const inCode = new Set<string>(ALL_PERMISSIONS);

    const missing = [...inCode].filter((code) => !inDb.has(code));
    const extra = [...inDb].filter((code) => !inCode.has(code));
    if (missing.length === 0 && extra.length === 0) return;

    const message =
      `permissions table and code disagree. Missing in database: [${missing.join(', ')}]. ` +
      `Not in code: [${extra.join(', ')}]. Run \`pnpm prisma db seed\`.`;
    this.logger.error(message);
    throw new Error(message);
  }
}
