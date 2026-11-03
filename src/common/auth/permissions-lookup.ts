import type { AuthenticatedUser } from './authenticated-user.js';
import type { PermissionCode } from './permissions.js';

/**
 * How `PermissionsGuard` asks "what may this user do?" without `common/` knowing where the
 * answer comes from. The `rbac` module provides the implementation (`PermissionsService`).
 */
export const PERMISSIONS_LOOKUP = Symbol('PERMISSIONS_LOOKUP');

export interface PermissionsLookup {
  forUser(user: AuthenticatedUser): Promise<ReadonlySet<PermissionCode>>;
}
