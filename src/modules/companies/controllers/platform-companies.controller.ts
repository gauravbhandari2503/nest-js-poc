import {
  Body,
  Controller,
  Get,
  HttpCode,
  Ip,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/auth/auth.decorators.js';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.js';
import { PlatformApi } from '../../../common/auth/surfaces.js';
import { uuidParam } from '../../../common/pipes/uuid-param.pipe.js';
import type { Page } from '../../../common/utils/pagination/index.js';
import type {
  CompanyDetailDto,
  CompanyDto,
  OnboardedCompanyDto,
} from '../dto/company.dto.js';
import { ListCompaniesQueryDto } from '../dto/list-companies-query.dto.js';
import { OnboardCompanyDto } from '../dto/onboard-company.dto.js';
import { UpdateCompanyDto } from '../dto/update-company.dto.js';
import { PlatformCompanyQueries } from '../queries/platform-company.queries.js';
import { CompanyOwnerInvitationService } from '../services/company-owner-invitation.service.js';
import { CompanyOnboardingService } from '../services/company-onboarding.service.js';
import { CompanyRatesService } from '../services/company-rates.service.js';
import { CompanyRegistrationFeeService } from '../services/company-registration-fee.service.js';

const actorOf = (user: AuthenticatedUser) => ({ id: user.id, kind: user.kind });

@PlatformApi()
@Controller('v1/platform/companies')
export class PlatformCompaniesController {
  constructor(
    private readonly onboarding: CompanyOnboardingService,
    private readonly rates: CompanyRatesService,
    private readonly registrationFee: CompanyRegistrationFeeService,
    private readonly ownerInvitation: CompanyOwnerInvitationService,
    private readonly queries: PlatformCompanyQueries,
  ) {}

  /** Creates a company and its owner; the owner gets an email to set a password. */
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: OnboardCompanyDto,
    @Ip() ip: string,
  ): Promise<OnboardedCompanyDto> {
    return this.onboarding.onboard(actorOf(user), dto, ip);
  }

  @Get()
  list(@Query() query: ListCompaniesQueryDto): Promise<Page<CompanyDto>> {
    return this.queries.list(query);
  }

  @Get(':id')
  get(@Param('id', uuidParam) id: string): Promise<CompanyDetailDto> {
    return this.queries.get(id);
  }

  /** Commission rates and suspend/activate. */
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuidParam) id: string,
    @Body() dto: UpdateCompanyDto,
    @Ip() ip: string,
  ): Promise<CompanyDto> {
    return this.rates.update(actorOf(user), id, dto, ip);
  }

  /** Records that the registration fee was paid at the office (once per company). */
  @Post(':id/registration-fee')
  @HttpCode(200)
  recordRegistrationFee(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuidParam) id: string,
    @Ip() ip: string,
  ): Promise<CompanyDto> {
    return this.registrationFee.record(actorOf(user), id, ip);
  }

  /** Sends the owner a new "set your password" email; the old link stops working. */
  @Post(':id/owner/resend-invitation')
  @HttpCode(202)
  resendOwnerInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuidParam) id: string,
    @Ip() ip: string,
  ): Promise<void> {
    return this.ownerInvitation.resend(actorOf(user), id, ip);
  }
}
