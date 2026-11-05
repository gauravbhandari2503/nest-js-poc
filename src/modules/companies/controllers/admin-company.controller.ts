import { Body, Controller, Ip, Patch } from '@nestjs/common';
import {
  CurrentCompany,
  CurrentUser,
  RequirePermissions,
} from '../../../common/auth/auth.decorators.js';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.js';
import { Permission } from '../../../common/auth/permissions.js';
import { AdminApi } from '../../../common/auth/surfaces.js';
import type { AdminCompanyDto } from '../dto/company.dto.js';
import { UpdateCompanyPolicyDto } from '../dto/update-company-policy.dto.js';
import { CompanyPolicyService } from '../services/company-policy.service.js';

@AdminApi()
@Controller('v1/admin/company')
export class AdminCompanyController {
  constructor(private readonly policy: CompanyPolicyService) {}

  /** Edit the cancellation and refund policy shown to customers. */
  @Patch()
  @RequirePermissions(Permission.CompanyManage)
  updatePolicy(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() dto: UpdateCompanyPolicyDto,
    @Ip() ip: string,
  ): Promise<AdminCompanyDto> {
    return this.policy.update(
      { id: user.id, kind: user.kind },
      companyId,
      dto,
      ip,
    );
  }
}
