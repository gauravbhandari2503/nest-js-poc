import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import {
  Authenticated,
  CurrentUser,
} from '../../../common/auth/auth.decorators.js';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.js';
import { AuthApi } from '../../../common/auth/surfaces.js';
import type { MeDto } from '../dto/me.dto.js';
import { MeQueries } from '../queries/me.queries.js';

@AuthApi()
@Controller('v1/auth/me')
export class AuthMeController {
  constructor(private readonly me: MeQueries) {}

  /** The current user, for every kind of account: profile, company (staff) and permissions. */
  @Get()
  @Authenticated()
  @ApiBearerAuth()
  get(@CurrentUser() user: AuthenticatedUser): Promise<MeDto> {
    return this.me.get(user);
  }
}
