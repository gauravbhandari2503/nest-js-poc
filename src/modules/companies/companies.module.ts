import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/index.js';
import { AdminCompanyController } from './controllers/admin-company.controller.js';
import { PlatformCompaniesController } from './controllers/platform-companies.controller.js';
import { PlatformCompanyQueries } from './queries/platform-company.queries.js';
import { CompanyOnboardingService } from './services/company-onboarding.service.js';
import { CompanyOwnerInvitationService } from './services/company-owner-invitation.service.js';
import { CompanyPolicyService } from './services/company-policy.service.js';
import { CompanyRatesService } from './services/company-rates.service.js';
import { CompanyRegistrationFeeService } from './services/company-registration-fee.service.js';

@Module({
  imports: [AuditModule],
  controllers: [PlatformCompaniesController, AdminCompanyController],
  providers: [
    CompanyOnboardingService,
    CompanyRatesService,
    CompanyRegistrationFeeService,
    CompanyPolicyService,
    CompanyOwnerInvitationService,
    PlatformCompanyQueries,
  ],
})
export class CompaniesModule {}
