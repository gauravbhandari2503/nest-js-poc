import { Controller, Get } from '@nestjs/common';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.js';
import {
  CompanyOptional,
  CurrentCompany,
  CurrentUser,
} from '../../../common/auth/auth.decorators.js';
import { AdminApi } from '../../../common/auth/surfaces.js';
import type { AdminMeDto } from '../dto/admin-me.dto.js';
import { AdminMeQueries } from '../queries/admin-me.queries.js';

@AdminApi()
@Controller('v1/admin/me')
export class AdminMeController {
  constructor(private readonly me: AdminMeQueries) {}

  /** Any staff member or super admin; no permission needed. A super admin may omit the company. */
  @Get()
  @CompanyOptional()
  get(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string | undefined,
  ): Promise<AdminMeDto> {
    return this.me.get(user, companyId);
  }
}
