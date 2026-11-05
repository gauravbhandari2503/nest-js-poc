import { Injectable } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error.js';
import { ErrorCode } from '../../../common/errors/error-codes.js';
import {
  buildPage,
  dateSortKey,
  keysetOrderBy,
  keysetWhere,
  type Page,
  pageQueryLimit,
} from '../../../common/utils/pagination/index.js';
import { PrismaService } from '../../../infra/prisma/prisma.service.js';
import type { CompanyDetailDto, CompanyDto } from '../dto/company.dto.js';
import { toCompanyDto } from '../dto/company.mapper.js';
import type { ListCompaniesQueryDto } from '../dto/list-companies-query.dto.js';

/** Every company: for the super admin only. */
@Injectable()
export class PlatformCompanyQueries {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListCompaniesQueryDto): Promise<Page<CompanyDto>> {
    const rows = await this.prisma.company.findMany({
      where: {
        AND: [
          query.status ? { status: query.status } : {},
          query.q
            ? {
                OR: [
                  { name: { contains: query.q, mode: 'insensitive' } },
                  { slug: { contains: query.q, mode: 'insensitive' } },
                ],
              }
            : {},
          keysetWhere(
            'createdAt',
            query.decodedCursor(),
            'desc',
            (value) => new Date(value),
          ),
        ],
      },
      orderBy: keysetOrderBy('createdAt', 'desc'),
      take: pageQueryLimit(query.limit),
    });
    return buildPage(rows.map(toCompanyDto), query.limit, (row) => ({
      sortKey: dateSortKey(row.createdAt),
      id: row.id,
    }));
  }

  async get(id: string): Promise<CompanyDetailDto> {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        staff: {
          where: { isOwner: true },
          take: 1,
          include: { user: true },
        },
      },
    });
    if (!company) {
      throw new DomainError(ErrorCode.NotFound, 'Company not found');
    }
    const owner = company.staff[0];
    return {
      ...toCompanyDto(company),
      owner: owner
        ? {
            userId: owner.userId,
            email: owner.user.email,
            fullName: owner.user.fullName,
            employeeId: owner.employeeId,
            status: owner.user.status,
          }
        : null,
    };
  }
}
