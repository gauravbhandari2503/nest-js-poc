import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  EMPLOYEE_ID_MAX_LENGTH,
  EMPLOYEE_ID_PATTERN,
} from '../../rbac/index.js';
import { SLUG_MAX_LENGTH, SLUG_PATTERN } from '../domain/company-slug.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class OnboardOwnerDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  fullName: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(20)
  phone?: string;

  /** The company's own staff number. Left out: the owner gets `bmt_<user id>`. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(EMPLOYEE_ID_MAX_LENGTH)
  @Matches(EMPLOYEE_ID_PATTERN, {
    message:
      'employeeId may contain letters, digits and . _ - / and must start with a letter or digit',
  })
  employeeId?: string;
}

export class OnboardCompanyDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  /** URL-safe name. Left out: made from `name`. */
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @MaxLength(SLUG_MAX_LENGTH)
  @Matches(SLUG_PATTERN, {
    message: 'slug may contain lowercase letters, digits and single dashes',
  })
  slug?: string;

  /** Percent of each ticket sale the platform keeps: `10` or `12.5`. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  salesCommissionPercent: number;

  /** Percent of each membership sale the platform keeps. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  membershipCommissionPercent: number;

  /** In the smallest currency unit (paise). */
  @IsInt()
  @Min(0)
  registrationFee: number;

  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  cancellationPolicy: string;

  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  refundPolicy: string;

  @ValidateNested()
  @Type(() => OnboardOwnerDto)
  owner: OnboardOwnerDto;
}
