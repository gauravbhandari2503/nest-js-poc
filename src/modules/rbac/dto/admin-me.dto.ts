import type { UserKind } from '../../../generated/prisma/client.js';
import type { PermissionCode } from '../../../common/auth/permissions.js';

export class AdminMeCompanyDto {
  id: string;
  name: string;
}

export class AdminMeDto {
  id: string;
  email: string;
  fullName: string;
  kind: UserKind;
  /** The company this request acts on (staff: their own; super admin: the X-Company-Id one, or null without it). */
  company: AdminMeCompanyDto | null;
  /** Every code the caller may use; for a super admin that is all of them. The portal hides menus from this list. */
  permissions: PermissionCode[];
}
