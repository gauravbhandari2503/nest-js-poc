import {
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { UserKind } from '../../generated/prisma/client.js';
import type { PermissionCode } from './permissions.js';
import type { AuthenticatedUser } from './authenticated-user.js';

export const IS_PUBLIC_KEY = 'isPublic';
export const ALLOWED_KINDS_KEY = 'allowedKinds';
export const REQUIRED_PERMISSIONS_KEY = 'requiredPermissions';

/** No authentication needed (`/v1/public`, login, webhooks). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Customer routes (`/v1/client`). */
export const ClientOnly = () => SetMetadata(ALLOWED_KINDS_KEY, ['CLIENT']);

/**
 * Company routes (`/v1/admin`). Company staff, and the super admin acting on a company
 * they name in the `X-Company-Id` header.
 */
export const StaffOnly = () =>
  SetMetadata(ALLOWED_KINDS_KEY, ['STAFF', 'SUPER_ADMIN'] satisfies UserKind[]);

/** Platform routes (`/v1/platform`): the super admin only. */
export const PlatformOnly = () =>
  SetMetadata(ALLOWED_KINDS_KEY, ['SUPER_ADMIN'] satisfies UserKind[]);

/** Every listed permission is required. The super admin holds all of them. */
export const RequirePermissions = (...permissions: PermissionCode[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);

export interface TenantRequest {
  user?: AuthenticatedUser;
  /** Set by TenantContextGuard on company routes. */
  companyId?: string;
}

export const CurrentUser = createParamDecorator(
  (_: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<TenantRequest>().user,
);

/** The company this request acts on: from the staff token, or the super admin's header. */
export const CurrentCompany = createParamDecorator(
  (_: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<TenantRequest>().companyId,
);
