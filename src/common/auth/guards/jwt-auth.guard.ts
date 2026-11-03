import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { isUUID } from 'class-validator';
import type { Env } from '../../../config/env.validation.js';
import { DomainError } from '../../errors/domain-error.js';
import { ErrorCode } from '../../errors/error-codes.js';
import type { AuthenticatedUser } from '../authenticated-user.js';
import { IS_PUBLIC_KEY, type TenantRequest } from '../auth.decorators.js';
import { ACCESS_COOKIE, readCookie } from '../cookies.js';

const KINDS = ['SUPER_ADMIN', 'STAFF', 'CLIENT'];
const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

interface AccessClaims {
  sub?: unknown;
  kind?: unknown;
  companyId?: unknown;
}

/**
 * Verifies the access token and puts the claims on `request.user`. The token comes from
 * the `Authorization: Bearer` header, or else from the `access_token` HttpOnly cookie.
 * Cookies are sent by the browser on its own, so a cookie-authenticated call that changes
 * data must come from the frontend's origin (CSRF). Routes marked `@Public()` skip it. First of the three auth guards (then TenantContextGuard, then
 * PermissionsGuard), so the others can rely on `request.user`.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    config: ConfigService<Env, true>,
  ) {
    this.frontendOrigin = new URL(
      config.get('FRONTEND_ORIGIN', { infer: true }),
    ).origin;
  }

  private readonly frontendOrigin: string;

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<
        TenantRequest & { method?: string; headers: Record<string, unknown> }
      >();
    const token = this.extractToken(request);
    let claims: AccessClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessClaims>(token);
    } catch (error) {
      if ((error as Error).name === 'TokenExpiredError') {
        throw new DomainError(ErrorCode.TokenExpired, 'Access token expired');
      }
      throw new DomainError(ErrorCode.Unauthenticated, 'Invalid access token');
    }

    request.user = toAuthenticatedUser(claims);
    return true;
  }

  private extractToken(request: {
    method?: string;
    headers: Record<string, unknown>;
  }): string {
    const header = request.headers['authorization'];
    if (header !== undefined) {
      const [scheme, token] =
        typeof header === 'string' ? header.split(' ') : [];
      if (scheme?.toLowerCase() === 'bearer' && token) return token;
      throw new DomainError(
        ErrorCode.Unauthenticated,
        'Send the access token as "Authorization: Bearer <token>"',
      );
    }

    const cookie = readCookie(request.headers['cookie'], ACCESS_COOKIE);
    if (!cookie) {
      throw new DomainError(
        ErrorCode.Unauthenticated,
        'Send the access token as "Authorization: Bearer <token>" or log in to get the cookie',
      );
    }
    const method = (request.method ?? 'GET').toUpperCase();
    if (
      !SAFE_METHODS.includes(method) &&
      request.headers['origin'] !== this.frontendOrigin
    ) {
      throw new DomainError(
        ErrorCode.Forbidden,
        'Requests that change data and use the login cookie must come from the app',
      );
    }
    return cookie;
  }
}

function toAuthenticatedUser(claims: AccessClaims): AuthenticatedUser {
  const { sub, kind, companyId } = claims;
  if (
    typeof sub !== 'string' ||
    !isUUID(sub) ||
    typeof kind !== 'string' ||
    !KINDS.includes(kind) ||
    (companyId !== undefined && typeof companyId !== 'string')
  ) {
    throw new DomainError(ErrorCode.Unauthenticated, 'Invalid access token');
  }
  return {
    id: sub,
    kind: kind as AuthenticatedUser['kind'],
    ...(companyId ? { companyId } : {}),
  };
}
