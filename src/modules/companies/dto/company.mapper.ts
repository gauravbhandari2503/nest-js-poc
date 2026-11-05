import type { Company } from '../../../generated/prisma/client.js';
import { bpsToPercent } from '../domain/commission.js';
import type { AdminCompanyDto, CompanyDto } from './company.dto.js';

export function toCompanyDto(company: Company): CompanyDto {
  return {
    id: company.id,
    name: company.name,
    slug: company.slug,
    status: company.status,
    salesCommissionPercent: bpsToPercent(company.salesCommissionBps),
    membershipCommissionPercent: bpsToPercent(company.membershipCommissionBps),
    registrationFee: company.registrationFee,
    registrationFeePaidAt: company.registrationFeePaidAt,
    cancellationPolicy: company.cancellationPolicy,
    refundPolicy: company.refundPolicy,
    createdAt: company.createdAt,
  };
}

export function toAdminCompanyDto(company: Company): AdminCompanyDto {
  return {
    id: company.id,
    name: company.name,
    slug: company.slug,
    status: company.status,
    cancellationPolicy: company.cancellationPolicy,
    refundPolicy: company.refundPolicy,
  };
}
