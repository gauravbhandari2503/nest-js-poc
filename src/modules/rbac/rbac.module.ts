import { Global, Module } from '@nestjs/common';
import { PERMISSIONS_LOOKUP } from '../../common/auth/permissions-lookup.js';
import { AdminMeController } from './controllers/admin-me.controller.js';
import { AdminMeQueries } from './queries/admin-me.queries.js';
import { PermissionsSyncService } from './services/permissions-sync.service.js';
import { PermissionsService } from './services/permissions.service.js';

/**
 * Global so the app-wide `PermissionsGuard` can resolve `PERMISSIONS_LOOKUP`, and so any
 * module that changes roles can inject `PermissionsService` to evict the cache.
 */
@Global()
@Module({
  controllers: [AdminMeController],
  providers: [
    AdminMeQueries,
    PermissionsService,
    PermissionsSyncService,
    { provide: PERMISSIONS_LOOKUP, useExisting: PermissionsService },
  ],
  exports: [PermissionsService, PERMISSIONS_LOOKUP],
})
export class RbacModule {}
