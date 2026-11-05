import type {
  CompanyStatus,
  UserKind,
} from '../../../generated/prisma/client.js';
import type { PermissionCode } from '../../../common/auth/permissions.js';

/** A staff member's company, without money terms (commission, registration fee). */
export class MeCompanyDto {
  id: string;
  name: string;
  slug: string;
  status: CompanyStatus;
  cancellationPolicy: string;
  refundPolicy: string;
}

/** The logged-in user, whoever they are: customer, company staff or super admin. */
export class MeDto {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  kind: UserKind;
  /** Staff only: the company's own staff number. */
  employeeId: string | null;
  /** Staff only: true for the company owner. */
  isOwner: boolean;
  /** Staff only: their company. Null for customers and the super admin. */
  company: MeCompanyDto | null;
  /** Every code the caller may use; the super admin holds all, customers none. The portal hides menus from this list. */
  permissions: PermissionCode[];
}
