import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env.validation.js';
import { PrismaService } from '../../../infra/prisma/prisma.service.js';
import type { AuthTokenPurpose } from '../../../generated/prisma/client.js';
import { hashToken, newOpaqueToken } from './token-hash.js';

/**
 * Issues the one-time tokens emailed to users (set password, reset password). Only the
 * hash is stored. Kept apart from `PasswordService` so the worker can send the "set your
 * password" email without loading the login and JWT machinery.
 */
@Injectable()
export class AuthTokenService {
  private readonly secret: string;

  constructor(
    config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {
    this.secret = config.get('JWT_REFRESH_SECRET', { infer: true });
  }

  /**
   * Creates a token for `userId` and returns the raw value to put in the email link.
   * Earlier unused tokens of the same purpose stop working, so a resent link replaces the
   * old one and only the newest email is valid.
   */
  async issue(
    userId: string,
    purpose: AuthTokenPurpose,
    ttlMs: number,
  ): Promise<string> {
    const token = newOpaqueToken();
    await this.prisma.$transaction([
      this.prisma.authToken.updateMany({
        where: { userId, purpose, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.authToken.create({
        data: {
          userId,
          purpose,
          tokenHash: hashToken(this.secret, token),
          expiresAt: new Date(Date.now() + ttlMs),
        },
      }),
    ]);
    return token;
  }
}
