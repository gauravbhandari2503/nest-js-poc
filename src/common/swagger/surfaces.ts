import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import {
  ClientOnly,
  PlatformOnly,
  Public,
  StaffOnly,
} from '../auth/decorators.js';

/**
 * One decorator per API surface. Put exactly one on each controller: it sets the Swagger
 * tag, the auth requirement shown in /docs, and the runtime access rule together, so the
 * docs cannot disagree with the guards. The architecture test checks that the decorator
 * matches the controller's folder and route prefix.
 */

/** `/v1/public`: no login. */
export const PublicApi = () => applyDecorators(ApiTags('public'), Public());

/** `/v1/auth`: login, refresh, password flows. No login needed to call them. */
export const AuthApi = () => applyDecorators(ApiTags('auth'), Public());

/** `/v1/client`: customers. */
export const ClientApi = () =>
  applyDecorators(ApiTags('client'), ApiBearerAuth(), ClientOnly());

/**
 * `/v1/admin`: company staff, and the super admin acting on a company (X-Company-Id).
 * Swagger UI: authorize with a bearer token; super admins also fill in `company`.
 */
export const AdminApi = () =>
  applyDecorators(
    ApiTags('admin'),
    ApiBearerAuth(),
    ApiSecurity(COMPANY_SECURITY),
    StaffOnly(),
  );

/** `/v1/platform`: the super admin only. */
export const PlatformApi = () =>
  applyDecorators(ApiTags('platform'), ApiBearerAuth(), PlatformOnly());

/** `/v1/webhooks`: called by the payment gateway, verified by signature instead of login. */
export const WebhookApi = () => applyDecorators(ApiTags('webhooks'), Public());

export const COMPANY_SECURITY = 'company';

export const API_SURFACES = [
  'public',
  'auth',
  'client',
  'admin',
  'platform',
  'webhooks',
] as const;
export type ApiSurface = (typeof API_SURFACES)[number];
