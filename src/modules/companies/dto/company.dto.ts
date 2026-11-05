import type {
  CompanyStatus,
  UserStatus,
} from '../../../generated/prisma/client.js';

export class CompanyDto {
  id: string;
  name: string;
  slug: string;
  status: CompanyStatus;
  /** Percent, e.g. `12.5`. */
  salesCommissionPercent: number;
  membershipCommissionPercent: number;
  registrationFee: number;
  registrationFeePaidAt: Date | null;
  cancellationPolicy: string;
  refundPolicy: string;
  createdAt: Date;
}

export class CompanyOwnerDto {
  userId: string;
  email: string;
  fullName: string;
  employeeId: string;
  /** `INVITED` until the owner sets a password from the emailed link. */
  status: UserStatus;
}

export class OnboardedCompanyDto {
  company: CompanyDto;
  owner: CompanyOwnerDto;
}

export class CompanyDetailDto extends CompanyDto {
  /** Null only if the company has no owner record. */
  owner: CompanyOwnerDto | null;
}

/** What company staff get back after editing their company: no money terms. */
export class AdminCompanyDto {
  id: string;
  name: string;
  slug: string;
  status: CompanyStatus;
  cancellationPolicy: string;
  refundPolicy: string;
}
