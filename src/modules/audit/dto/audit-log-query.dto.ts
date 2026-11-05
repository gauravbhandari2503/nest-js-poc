import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Filters of the audit log viewer; newest first. */
export class AuditLogQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsUUID()
  actorId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  module?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  action?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  entityType?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  entityId?: string;

  /** ISO 8601, inclusive. */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** ISO 8601, inclusive. */
  @IsOptional()
  @IsDateString()
  to?: string;
}
