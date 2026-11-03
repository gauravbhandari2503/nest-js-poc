import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  Authenticated,
  CurrentUser,
} from '../../../common/auth/auth.decorators.js';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.js';
import { DomainError } from '../../../common/errors/domain-error.js';
import { ErrorCode } from '../../../common/errors/error-codes.js';
import { AuthApi } from '../../../common/auth/surfaces.js';
import { ChangePasswordDto, LoginDto, RegisterDto } from '../dto/auth.dto.js';
import type { SessionDto } from '../dto/session.dto.js';
import { type AuthResult, AuthService } from '../services/auth.service.js';
import {
  clearSessionCookies,
  readRefreshCookie,
  setSessionCookies,
} from '../http/session-cookies.js';

/** Login, register and session routes get a much lower limit than the global default. */
const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@AuthApi()
@Throttle(AUTH_THROTTLE)
@Controller('v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionDto> {
    return respond(res, await this.auth.register(dto));
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionDto> {
    return respond(res, await this.auth.login(dto));
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionDto> {
    const token = readRefreshCookie(req);
    if (!token) {
      throw new DomainError(ErrorCode.Unauthenticated, 'No refresh token');
    }
    try {
      return respond(res, await this.auth.refresh(token));
    } catch (error) {
      clearSessionCookies(res);
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(readRefreshCookie(req));
    clearSessionCookies(res);
  }

  /** The one auth route that needs a logged-in user (overrides the controller's `@Public`). */
  @Post('password/change')
  @Authenticated()
  @HttpCode(204)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.auth.changePassword(user.id, dto);
  }
}

function respond(res: Response, result: AuthResult): SessionDto {
  setSessionCookies(res, result);
  return {
    accessToken: result.accessToken,
    expiresIn: result.expiresIn,
    user: result.user,
  };
}
