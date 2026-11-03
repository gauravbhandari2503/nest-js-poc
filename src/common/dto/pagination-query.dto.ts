import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { decodeCursor, type Cursor } from '../utils/pagination/cursor.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../utils/pagination/page.js';

/** Query string of every collection endpoint: `?limit=20&cursor=...`. Extend it for filters. */
export class PaginationQueryDto {
  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
    default: DEFAULT_PAGE_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit: number = DEFAULT_PAGE_SIZE;

  @ApiPropertyOptional({
    description: 'Opaque cursor from the previous page (`page.nextCursor`)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  /** The decoded cursor, or undefined for the first page. Throws 422 if it is malformed. */
  decodedCursor(): Cursor | undefined {
    return this.cursor ? decodeCursor(this.cursor) : undefined;
  }
}
