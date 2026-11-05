import { Global, Module } from '@nestjs/common';
import { PERMISSIONS_LOOKUP } from '../../common/auth/permissions-lookup.js';
import { AuthMeController } from './controllers/auth-me.controller.js';
import { MeQueries } from './queries/me.queries.js';
import { PermissionsSyncService } from './services/permissions-sync.service.js';
import { PermissionsService } from './services/permissions.service.js';

/**
 * Global so the app-wide `PermissionsGuard` can resolve `PERMISSIONS_LOOKUP`, and so any
 * module that changes roles can inject `PermissionsService` to evict the cache.
 */
@Global()
@Module({
  controllers: [AuthMeController],
  providers: [
    MeQueries,
    PermissionsService,
    PermissionsSyncService,
    { provide: PERMISSIONS_LOOKUP, useExisting: PermissionsService },
  ],
  exports: [PermissionsService, PERMISSIONS_LOOKUP],
})
export class RbacModule {}
