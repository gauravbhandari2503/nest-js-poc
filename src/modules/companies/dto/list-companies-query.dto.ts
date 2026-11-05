import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';
import type { CompanyStatus } from '../../../generated/prisma/client.js';

export class ListCompaniesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status?: CompanyStatus;

  /** Matches part of the name or slug. */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  q?: string;
}
