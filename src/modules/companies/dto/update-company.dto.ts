import { IsIn, IsNumber, IsOptional, Max, Min } from 'class-validator';
import type { CompanyStatus } from '../../../generated/prisma/client.js';

/** Platform edit of a company. Send only what changes; at least one field. */
export class UpdateCompanyDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  salesCommissionPercent?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  membershipCommissionPercent?: number;

  /** `SUSPENDED` hides the company from customers and stops its staff at the next refresh. */
  @IsOptional()
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status?: CompanyStatus;
}
