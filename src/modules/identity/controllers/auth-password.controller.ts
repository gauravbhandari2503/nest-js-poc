import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthApi } from '../../../common/auth/surfaces.js';
import { ForgotPasswordDto, SetPasswordDto } from '../dto/password.dto.js';
import { PasswordService } from '../services/password.service.js';

@AuthApi()
@Throttle({ default: { limit: 5, ttl: 60_000 } })
@Controller('v1/auth/password')
export class AuthPasswordController {
  constructor(private readonly passwords: PasswordService) {}

  /** New owner or invited staff sets a first password with the emailed token. */
  @Post('setup')
  @HttpCode(204)
  async setup(@Body() dto: SetPasswordDto): Promise<void> {
    await this.passwords.setup(dto.token, dto.password);
  }

  /** Always 202, whether or not the email has an account. */
  @Post('forgot')
  @HttpCode(202)
  async forgot(@Body() dto: ForgotPasswordDto): Promise<void> {
    await this.passwords.forgot(dto.email);
  }

  @Post('reset')
  @HttpCode(204)
  async reset(@Body() dto: SetPasswordDto): Promise<void> {
    await this.passwords.reset(dto.token, dto.password);
  }
}
