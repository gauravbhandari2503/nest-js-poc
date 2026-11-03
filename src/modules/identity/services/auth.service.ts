import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.js';
import { DomainError } from '../../../common/errors/domain-error.js';
import { ErrorCode } from '../../../common/errors/error-codes.js';
import { PrismaService } from '../../../infra/prisma/prisma.service.js';
import type {
  ChangePasswordDto,
  LoginDto,
  RegisterDto,
} from '../dto/auth.dto.js';
import type { SessionUserDto } from '../dto/session.dto.js';
import { PasswordHasher } from './password-hasher.js';
import { type IssuedSession, TokenService } from './token.service.js';

export interface AuthResult extends IssuedSession {
  user: SessionUserDto;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly hasher: PasswordHasher,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (existing) throw emailTaken();

    const user = await this.prisma.user
      .create({
        data: {
          kind: 'CLIENT',
          email: dto.email,
          fullName: dto.fullName,
          passwordHash: await this.hasher.hash(dto.password),
          status: 'ACTIVE',
          lastLoginAt: new Date(),
        },
      })
      .catch((error: { code?: string }) => {
        // Two sign-ups with the same email racing past the check above.
        throw error.code === 'P2002' ? emailTaken() : error;
      });
    return this.start({ id: user.id, kind: 'CLIENT' }, user);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    const passwordOk = await this.hasher.verify(
      user?.passwordHash,
      dto.password,
    );
    if (!user || !passwordOk || user.status !== 'ACTIVE') {
      throw new DomainError(
        ErrorCode.InvalidCredentials,
        'Wrong email or password',
      );
    }

    const claims = await this.claimsFor(user.id);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    return this.start(claims, user);
  }

  async refresh(rawToken: string): Promise<AuthResult> {
    const { claims, ...session } = await this.tokens.rotate(
      rawToken,
      (userId) => this.claimsFor(userId),
    );
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: claims.id },
    });
    return { ...session, user: toSessionUser(user, claims) };
  }

  logout(rawToken: string | undefined): Promise<void> {
    return rawToken ? this.tokens.revoke(rawToken) : Promise.resolve();
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (
      !user ||
      !(await this.hasher.verify(user.passwordHash, dto.currentPassword))
    ) {
      throw new DomainError(
        ErrorCode.InvalidCredentials,
        'Current password is wrong',
      );
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await this.hasher.hash(dto.newPassword) },
    });
    await this.tokens.revokeAllForUser(userId);
  }

  /**
   * The claims a token carries, from the database: so a refresh picks up a deactivated
   * staff member, a suspended company or a disabled account.
   */
  private async claimsFor(userId: string): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        kind: true,
        status: true,
        staff: {
          select: {
            companyId: true,
            deactivatedAt: true,
            company: { select: { status: true } },
          },
        },
      },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new DomainError(ErrorCode.Unauthenticated, 'Account is not active');
    }
    if (user.kind !== 'STAFF') return { id: user.id, kind: user.kind };

    if (!user.staff || user.staff.deactivatedAt) {
      throw new DomainError(
        ErrorCode.Forbidden,
        'Staff account is deactivated',
      );
    }
    if (user.staff.company.status !== 'ACTIVE') {
      throw new DomainError(ErrorCode.Forbidden, 'Company is suspended');
    }
    return { id: user.id, kind: 'STAFF', companyId: user.staff.companyId };
  }

  private async start(
    claims: AuthenticatedUser,
    user: { id: string; email: string; fullName: string },
  ): Promise<AuthResult> {
    const session = await this.tokens.issueSession(claims);
    return { ...session, user: toSessionUser(user, claims) };
  }
}

const emailTaken = () =>
  new DomainError(
    ErrorCode.EmailTaken,
    'An account with this email already exists',
  );

function toSessionUser(
  user: { id: string; email: string; fullName: string },
  claims: AuthenticatedUser,
): SessionUserDto {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    kind: claims.kind,
    ...(claims.companyId ? { companyId: claims.companyId } : {}),
  };
}
