import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainError } from '../../../common/errors/domain-error.js';
import { ErrorCode } from '../../../common/errors/error-codes.js';
import type { Env } from '../../../config/env.validation.js';
import { MailService } from '../../../infra/mail/mail.service.js';
import { PrismaService } from '../../../infra/prisma/prisma.service.js';
import type { AuthTokenPurpose } from '../../../generated/prisma/client.js';
import { PasswordHasher } from './password-hasher.js';
import { hashToken, newOpaqueToken } from './token-hash.js';
import { TokenService } from './token.service.js';

const HOUR_MS = 3_600_000;
export const SET_PASSWORD_TTL_MS = 72 * HOUR_MS;
export const RESET_PASSWORD_TTL_MS = HOUR_MS;

@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);
  private readonly secret: string;
  private readonly frontendOrigin: string;

  constructor(
    config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly mail: MailService,
  ) {
    this.secret = config.get('JWT_REFRESH_SECRET', { infer: true });
    this.frontendOrigin = config.get('FRONTEND_ORIGIN', { infer: true });
  }

  /**
   * Creates a one-time token for `userId` and returns the raw value (only its hash is
   * stored). Used here for password resets, and by company onboarding and staff
   * invitations for the "set your password" email.
   */
  async issueToken(
    userId: string,
    purpose: AuthTokenPurpose,
    ttlMs: number,
  ): Promise<string> {
    const token = newOpaqueToken();
    await this.prisma.authToken.create({
      data: {
        userId,
        purpose,
        tokenHash: hashToken(this.secret, token),
        expiresAt: new Date(Date.now() + ttlMs),
      },
    });
    return token;
  }

  /** New owner or invited staff chooses a first password; the account becomes ACTIVE. */
  async setup(token: string, password: string): Promise<void> {
    await this.consume(token, 'SET_PASSWORD', password, true);
  }

  /**
   * Always succeeds from the caller's point of view, so the endpoint cannot be used to
   * find out which emails have accounts. The email is only sent for active accounts.
   */
  async forgot(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status !== 'ACTIVE') return;

    const token = await this.issueToken(
      user.id,
      'RESET_PASSWORD',
      RESET_PASSWORD_TTL_MS,
    );
    const link = `${this.frontendOrigin}/reset-password?token=${token}`;
    try {
      await this.mail.send({
        to: user.email,
        subject: 'Reset your password',
        text: `Hi ${user.fullName},\n\nUse this link to choose a new password (valid for 1 hour):\n${link}\n\nIf you did not ask for this, ignore this email.`,
      });
    } catch (error) {
      // Same response either way; the failure goes to the log, not to the caller.
      this.logger.error(
        `Password reset email failed: ${(error as Error).message}`,
      );
    }
  }

  async reset(token: string, password: string): Promise<void> {
    await this.consume(token, 'RESET_PASSWORD', password, false);
  }

  private async consume(
    rawToken: string,
    purpose: AuthTokenPurpose,
    password: string,
    activate: boolean,
  ): Promise<void> {
    const passwordHash = await this.hasher.hash(password);
    const tokenHash = hashToken(this.secret, rawToken);

    const userId = await this.prisma.$transaction(async (tx) => {
      // The conditional update is the lock: only one request can mark the token used.
      const claimed = await tx.authToken.updateMany({
        where: {
          tokenHash,
          purpose,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { usedAt: new Date() },
      });
      if (claimed.count === 0) {
        throw new DomainError(
          ErrorCode.LinkInvalid,
          'This link is invalid or has expired',
        );
      }
      const row = await tx.authToken.findUniqueOrThrow({
        where: { tokenHash },
        select: { userId: true },
      });
      await tx.user.update({
        where: { id: row.userId },
        data: { passwordHash },
      });
      if (activate) {
        // Only an invited account is activated; a disabled one stays disabled.
        await tx.user.updateMany({
          where: { id: row.userId, status: 'INVITED' },
          data: { status: 'ACTIVE' },
        });
      }
      return row.userId;
    });

    // A new password ends every existing session.
    await this.tokens.revokeAllForUser(userId);
  }
}
