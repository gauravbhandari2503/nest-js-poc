import { type INestApplication, Controller, Get } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import argon2 from 'argon2';
import { AppModule } from '../../src/app.module.js';
import { Permission, SystemRole } from '../../src/common/auth/permissions.js';
import {
  CurrentCompany,
  RequirePermissions,
} from '../../src/common/auth/auth.decorators.js';
import { AdminApi } from '../../src/common/auth/surfaces.js';
import { validationExceptionFactory } from '../../src/common/pipes/validation-exception.factory.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import {
  MailService,
  type MailMessage,
} from '../../src/infra/mail/mail.service.js';
import { createCompany, uid } from '../db/helpers.js';

/** A permissioned admin route, so the permission matrix can be tested before module 3 adds real ones. */
@AdminApi()
@Controller('v1/admin/__probe')
export class ProbeController {
  /** Any staff member; echoes the company the guards resolved. */
  @Get('any')
  any(@CurrentCompany() companyId: string) {
    return { companyId };
  }

  @Get('show-manage')
  @RequirePermissions(Permission.ShowManage)
  showManage() {
    return { ok: true };
  }
}

export const PASSWORD = 'correct-horse-battery';

export class CapturedMail extends MailService {
  readonly sent: MailMessage[] = [];
  async send(message: MailMessage) {
    this.sent.push(message);
  }
}

export async function createApp(): Promise<{
  app: INestApplication;
  mail: CapturedMail;
}> {
  const mail = new CapturedMail();
  const { ValidationPipe } = await import('@nestjs/common');
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: [ProbeController],
  })
    .overrideProvider(MailService)
    .useValue(mail)
    // Auth routes allow 10 requests a minute; the tests make far more than that.
    .overrideProvider(ThrottlerStorage)
    .useValue({
      increment: async () => ({
        totalHits: 1,
        timeToExpire: 0,
        isBlocked: false,
        timeToBlockExpire: 0,
      }),
    })
    .compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
  await app.init();
  return { app, mail };
}

export async function createAccount(
  prisma: PrismaClient,
  kind: 'SUPER_ADMIN' | 'STAFF' | 'CLIENT',
  options: {
    companyId?: string;
    roleName?: string;
    isOwner?: boolean;
    status?: 'INVITED' | 'ACTIVE' | 'DISABLED';
    password?: string | null;
  } = {},
) {
  const user = await prisma.user.create({
    data: {
      kind,
      email: `${kind.toLowerCase()}-${uid()}@test.local`,
      fullName: 'Test User',
      status: options.status ?? 'ACTIVE',
      passwordHash:
        options.password === null
          ? null
          : await argon2.hash(options.password ?? PASSWORD),
    },
  });
  if (kind === 'STAFF') {
    const role = await prisma.role.findFirstOrThrow({
      where: {
        name: options.roleName ?? SystemRole.CompanyOwner,
        companyId: null,
      },
    });
    await prisma.companyStaff.create({
      data: {
        companyId: options.companyId!,
        userId: user.id,
        employeeId: `bmt_${user.id}`,
        isOwner: options.isOwner ?? false,
        roleId: role.id,
      },
    });
  }
  return user;
}

export async function createTenant(prisma: PrismaClient, adminId: string) {
  return createCompany(prisma, adminId);
}

/** One cookie from a response's Set-Cookie headers (value plus raw attributes). */
export function cookieOf(
  res: { headers: Record<string, unknown> },
  name: string,
) {
  const raw = ((res.headers['set-cookie'] as string[] | undefined) ?? []).find(
    (c) => c.startsWith(`${name}=`),
  );
  if (!raw) return undefined;
  const [pair, ...attributes] = raw.split(';').map((p) => p.trim());
  return {
    value: pair!.slice(name.length + 1),
    attributes: attributes.map((a) => a.toLowerCase()),
  };
}

export const refreshCookie = (res: { headers: Record<string, unknown> }) =>
  cookieOf(res, 'refresh_token');
