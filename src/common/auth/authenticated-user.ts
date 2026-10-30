import type { UserKind } from '../../generated/prisma/client.js';

/** What the JWT guard puts on `request.user` (the access token claims). */
export interface AuthenticatedUser {
  id: string;
  kind: UserKind;
  /** Set for STAFF only; super admin picks a company per request (X-Company-Id). */
  companyId?: string;
}

/** Header a super admin sends to act on a company through the `/v1/admin/*` routes. */
export const COMPANY_HEADER = 'x-company-id';
