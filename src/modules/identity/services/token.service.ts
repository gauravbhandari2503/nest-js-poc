import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.js';
import { DomainError } from '../../../common/errors/domain-error.js';
import { ErrorCode } from '../../../common/errors/error-codes.js';
import type { Env } from '../../../config/env.validation.js';
import { PrismaService } from '../../../infra/prisma/prisma.service.js';
import { durationToMs } from '../domain/duration.js';
import { hashToken, newOpaqueToken } from './token-hash.js';

export interface IssuedSession {
  accessToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
}

/**
 * Access tokens are short JWTs; refresh tokens are opaque, stored hashed and rotated on
 * every use. A rotated token that shows up again means it was stolen (or replayed), so
 * the whole family, every token descended from the same login, is revoked.
 */
@Injectable()
export class TokenService {
  private readonly accessTtlMs: number;
  private readonly refreshTtlMs: number;
  private readonly refreshSecret: string;

  constructor(
    config: ConfigService<Env, true>,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {
    this.accessTtlMs = durationToMs(
      config.get('JWT_ACCESS_TTL', { infer: true }),
    );
    this.refreshTtlMs = durationToMs(
      config.get('JWT_REFRESH_TTL', { infer: true }),
    );
    this.refreshSecret = config.get('JWT_REFRESH_SECRET', { infer: true });
  }

  /** Starts a new login: a new token family. */
  issueSession(user: AuthenticatedUser): Promise<IssuedSession> {
    return this.issue(user, randomUUID()).then(
      ({ id: _id, ...session }) => session,
    );
  }

  /**
   * Exchanges a refresh token for a new pair. `loadUser` returns the user's current claims
   * (or throws if the account may no longer log in), so role or company changes apply here.
   */
  async rotate(
    rawToken: string,
    loadUser: (userId: string) => Promise<AuthenticatedUser>,
  ): Promise<IssuedSession & { claims: AuthenticatedUser }> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(this.refreshSecret, rawToken) },
    });
    if (!stored) {
      throw new DomainError(ErrorCode.Unauthenticated, 'Invalid refresh token');
    }
    if (stored.revokedAt) {
      await this.revokeFamily(stored.familyId);
      throw new DomainError(
        ErrorCode.Unauthenticated,
        'Refresh token already used; please log in again',
      );
    }
    if (stored.expiresAt <= new Date()) {
      throw new DomainError(ErrorCode.Unauthenticated, 'Refresh token expired');
    }

    let user: AuthenticatedUser;
    try {
      user = await loadUser(stored.userId);
    } catch (error) {
      await this.revokeFamily(stored.familyId);
      throw error;
    }

    // Claim the old token atomically: of two concurrent refreshes, only one gets count 1.
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count === 0) {
      await this.revokeFamily(stored.familyId);
      throw new DomainError(
        ErrorCode.Unauthenticated,
        'Refresh token already used; please log in again',
      );
    }

    const { id, ...session } = await this.issue(user, stored.familyId);
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { replacedBy: id },
    });
    return { ...session, claims: user };
  }

  /** Logout: ends the whole session family. Unknown tokens are ignored (logout is idempotent). */
  async revoke(rawToken: string): Promise<void> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(this.refreshSecret, rawToken) },
      select: { familyId: true },
    });
    if (stored) await this.revokeFamily(stored.familyId);
  }

  /** Password changes and resets end every session of the user. */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private revokeFamily(familyId: string) {
    return this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issue(
    user: AuthenticatedUser,
    familyId: string,
  ): Promise<IssuedSession & { id: string }> {
    const accessToken = await this.jwt.signAsync(
      {
        kind: user.kind,
        ...(user.companyId ? { companyId: user.companyId } : {}),
      },
      { subject: user.id, expiresIn: Math.floor(this.accessTtlMs / 1000) },
    );
    const refreshToken = newOpaqueToken();
    const refreshExpiresAt = new Date(Date.now() + this.refreshTtlMs);
    const row = await this.prisma.refreshToken.create({
      select: { id: true },
      data: {
        userId: user.id,
        familyId,
        tokenHash: hashToken(this.refreshSecret, refreshToken),
        expiresAt: refreshExpiresAt,
      },
    });
    return {
      id: row.id,
      accessToken,
      expiresIn: Math.floor(this.accessTtlMs / 1000),
      refreshToken,
      refreshExpiresAt,
    };
  }
}
