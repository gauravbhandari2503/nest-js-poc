import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DomainError } from '../errors/domain-error.js';
import { ErrorCode } from '../errors/error-codes.js';
import {
  ALLOWED_KINDS_KEY,
  REQUIRED_PERMISSIONS_KEY,
  type TenantRequest,
} from './decorators.js';
import { PermissionsService } from './permissions.service.js';
import type { PermissionCode } from './permissions.js';

/** Enforces `@ClientOnly/@StaffOnly/@PlatformOnly` (user kind) and `@RequirePermissions`. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const user = context.switchToHttp().getRequest<TenantRequest>().user;
    if (!user) {
      throw new DomainError(
        ErrorCode.Unauthenticated,
        'Authentication required',
      );
    }

    const kinds = this.reflector.getAllAndOverride<string[] | undefined>(
      ALLOWED_KINDS_KEY,
      targets,
    );
    if (kinds && !kinds.includes(user.kind)) {
      throw new DomainError(
        ErrorCode.Forbidden,
        'This route is not available to your account',
      );
    }

    const required = this.reflector.getAllAndOverride<
      PermissionCode[] | undefined
    >(REQUIRED_PERMISSIONS_KEY, targets);
    if (!required?.length) return true;

    const held = await this.permissions.forUser(user);
    const missing = required.filter((code) => !held.has(code));
    if (missing.length > 0) {
      throw new DomainError(
        ErrorCode.Forbidden,
        `Missing permission: ${missing.join(', ')}`,
      );
    }
    return true;
  }
}
