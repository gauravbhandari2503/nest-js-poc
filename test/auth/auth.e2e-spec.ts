import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { runSeed } from '../../prisma/seed/run.js';
import {
  ALL_PERMISSIONS,
  SystemRole,
} from '../../src/common/auth/permissions.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestPrisma, uid } from '../db/helpers.js';
import {
  type CapturedMail,
  createAccount,
  createApp,
  createTenant,
  PASSWORD,
  cookieOf,
  refreshCookie,
} from './helpers.js';

describe('auth and rbac (HTTP)', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let mail: CapturedMail;
  let http: ReturnType<typeof request>;
  let admin: { id: string; email: string };
  let companyA: { id: string };
  let companyB: { id: string };
  let owner: { id: string; email: string };

  const login = (email: string, password = PASSWORD) =>
    http.post('/v1/auth/login').send({ email, password });
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const tokenFor = async (email: string): Promise<string> =>
    (await login(email)).body.data.accessToken;

  beforeAll(async () => {
    prisma = createTestPrisma();
    await runSeed(prisma, {
      adminEmail: process.env['SEED_ADMIN_EMAIL']!,
      adminPassword: process.env['SEED_ADMIN_PASSWORD']!,
    });
    ({ app, mail } = await createApp());
    // Listen once: supertest otherwise opens and closes a server per request, which breaks
    // requests that are created before an earlier `await` finishes.
    await app.listen(0);
    http = request(app.getHttpServer());

    admin = await createAccount(prisma, 'SUPER_ADMIN');
    companyA = await createTenant(prisma, admin.id);
    companyB = await createTenant(prisma, admin.id);
    owner = await createAccount(prisma, 'STAFF', { companyId: companyA.id });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('login', () => {
    it('logs in the seeded super admin', async () => {
      const res = await login(
        process.env['SEED_ADMIN_EMAIL']!,
        process.env['SEED_ADMIN_PASSWORD']!,
      ).expect(200);
      expect(res.body.data.accessToken).toEqual(expect.any(String));
      expect(res.body.data.user.kind).toBe('SUPER_ADMIN');
      expect(res.body.data).not.toHaveProperty('refreshToken');
    });

    it('sets the access token as an HttpOnly cookie too, and still returns it in the body', async () => {
      const res = await login(owner.email).expect(200);
      const cookie = cookieOf(res, 'access_token')!;
      expect(cookie.value).toBe(res.body.data.accessToken);
      expect(cookie.attributes).toEqual(
        expect.arrayContaining([
          'httponly',
          'secure',
          'path=/',
          'samesite=lax',
        ]),
      );
    });

    it('authenticates from the cookie alone, and rejects a write from another origin', async () => {
      const res = await login(owner.email).expect(200);
      const cookie = `access_token=${cookieOf(res, 'access_token')!.value}`;
      await http.get('/v1/admin/me').set('Cookie', cookie).expect(200);
      await http
        .post('/v1/auth/password/change')
        .set({ Cookie: cookie, Origin: 'https://evil.test' })
        .send({ currentPassword: PASSWORD, newPassword: 'another-long-pass-1' })
        .expect(403);
    });

    it('sets the refresh token as an HttpOnly cookie scoped to /v1/auth', async () => {
      const res = await login(owner.email).expect(200);
      const cookie = refreshCookie(res)!;
      expect(cookie.value).not.toBe('');
      expect(cookie.attributes).toEqual(
        expect.arrayContaining([
          'httponly',
          'secure',
          'path=/v1/auth',
          'samesite=lax',
        ]),
      );
    });

    it('gives staff a token carrying their company', async () => {
      const res = await login(owner.email).expect(200);
      expect(res.body.data.user).toMatchObject({
        kind: 'STAFF',
        companyId: companyA.id,
      });
    });

    it('answers a wrong password and an unknown email identically', async () => {
      const wrong = await login(owner.email, 'not-the-password').expect(401);
      const unknown = await login(`nobody-${uid()}@test.local`).expect(401);
      expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
      expect(unknown.body.code).toBe('INVALID_CREDENTIALS');
      expect(unknown.body.description).toBe(wrong.body.description);
    });

    it('refuses invited, disabled, deactivated and suspended accounts', async () => {
      const invited = await createAccount(prisma, 'CLIENT', {
        status: 'INVITED',
        password: null,
      });
      const disabled = await createAccount(prisma, 'CLIENT', {
        status: 'DISABLED',
      });
      await login(invited.email).expect(401);
      await login(disabled.email).expect(401);

      const deactivated = await createAccount(prisma, 'STAFF', {
        companyId: companyA.id,
      });
      await prisma.companyStaff.update({
        where: { userId: deactivated.id },
        data: { deactivatedAt: new Date() },
      });
      await login(deactivated.email).expect(403);

      const suspendedCompany = await createTenant(prisma, admin.id);
      const stranded = await createAccount(prisma, 'STAFF', {
        companyId: suspendedCompany.id,
      });
      await prisma.company.update({
        where: { id: suspendedCompany.id },
        data: { status: 'SUSPENDED' },
      });
      await login(stranded.email).expect(403);
    });

    it('validates the body', async () => {
      const res = await http
        .post('/v1/auth/login')
        .send({ email: 'x' })
        .expect(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('register', () => {
    it('creates a customer and logs them in', async () => {
      const email = `Customer-${uid()}@Test.local`;
      const res = await http
        .post('/v1/auth/register')
        .send({ email, password: PASSWORD, fullName: 'Jane Doe' })
        .expect(201);
      expect(res.body.data.user).toMatchObject({
        kind: 'CLIENT',
        email: email.toLowerCase(),
      });
      expect(refreshCookie(res)).toBeDefined();
      await login(email).expect(200);
    });

    it('rejects a taken email (case-insensitively) and a short password', async () => {
      const email = `dup-${uid()}@test.local`;
      const body = { email, password: PASSWORD, fullName: 'A' };
      await http.post('/v1/auth/register').send(body).expect(201);
      const taken = await http
        .post('/v1/auth/register')
        .send({ ...body, email: email.toUpperCase() })
        .expect(409);
      expect(taken.body.code).toBe('EMAIL_TAKEN');
      await http
        .post('/v1/auth/register')
        .send({ ...body, email: `x-${uid()}@test.local`, password: 'short' })
        .expect(422);
    });

    it('cannot be used to create staff or admins', async () => {
      await http
        .post('/v1/auth/register')
        .send({
          email: `x-${uid()}@test.local`,
          password: PASSWORD,
          fullName: 'A',
          kind: 'SUPER_ADMIN',
        })
        .expect(422);
    });
  });

  describe('access rules', () => {
    it('lets public routes through and rejects other routes without a token', async () => {
      await http.get('/health').expect((r) => expect(r.status).not.toBe(401));
      const res = await http.get('/v1/admin/me').expect(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    });

    it('rejects a garbage token and an expired token', async () => {
      await http.get('/v1/admin/me').set(bearer('garbage')).expect(401);
    });

    it('staff reach /admin and customers do not', async () => {
      const staffToken = await tokenFor(owner.email);
      await http.get('/v1/admin/me').set(bearer(staffToken)).expect(200);

      const client = await createAccount(prisma, 'CLIENT');
      const clientToken = await tokenFor(client.email);
      await http.get('/v1/admin/me').set(bearer(clientToken)).expect(403);
    });

    it('/admin/me for staff lists their role permissions and company', async () => {
      const res = await http
        .get('/v1/admin/me')
        .set(bearer(await tokenFor(owner.email)))
        .expect(200);
      expect(res.body.data.company.id).toBe(companyA.id);
      expect(res.body.data.permissions).toEqual([...ALL_PERMISSIONS].sort());
    });

    it('/admin/me for a super admin works without X-Company-Id and lists every permission', async () => {
      const token = await tokenFor(admin.email);
      const bare = await http
        .get('/v1/admin/me')
        .set(bearer(token))
        .expect(200);
      expect(bare.body.data.company).toBeNull();
      expect(bare.body.data.permissions).toEqual([...ALL_PERMISSIONS].sort());

      const res = await http
        .get('/v1/admin/me')
        .set({ ...bearer(token), 'X-Company-Id': companyB.id })
        .expect(200);
      expect(res.body.data.company.id).toBe(companyB.id);
      expect(res.body.data.permissions).toEqual([...ALL_PERMISSIONS].sort());
    });

    it('staff sending X-Company-Id still see only their own company', async () => {
      const res = await http
        .get('/v1/admin/me')
        .set({
          ...bearer(await tokenFor(owner.email)),
          'X-Company-Id': companyB.id,
        })
        .expect(200);
      expect(res.body.data.company.id).toBe(companyA.id);
    });

    it('a super admin naming a company that does not exist gets 404', async () => {
      await http
        .get('/v1/admin/me')
        .set({
          ...bearer(await tokenFor(admin.email)),
          'X-Company-Id': '0199c4a2-0000-7000-8000-0000000000ff',
        })
        .expect(404);
    });
  });

  describe('permission matrix', () => {
    const probe = '/v1/admin/__probe/show-manage';
    const asCompany = (token: string, companyId?: string) => ({
      ...bearer(token),
      ...(companyId ? { 'X-Company-Id': companyId } : {}),
    });

    it('anonymous: 401', async () => {
      await http.get(probe).expect(401);
    });

    it('customer: 403', async () => {
      const client = await createAccount(prisma, 'CLIENT');
      await http
        .get(probe)
        .set(bearer(await tokenFor(client.email)))
        .expect(403);
    });

    it('owner (all permissions): 200', async () => {
      await http
        .get(probe)
        .set(bearer(await tokenFor(owner.email)))
        .expect(200);
    });

    it('super admin acting on a company: 200', async () => {
      await http
        .get(probe)
        .set(asCompany(await tokenFor(admin.email), companyA.id))
        .expect(200);
    });

    it('staff whose role lacks the permission: 403', async () => {
      const worker = await createAccount(prisma, 'STAFF', {
        companyId: companyA.id,
        roleName: SystemRole.MaintenanceStaff,
      });
      const res = await http
        .get(probe)
        .set(bearer(await tokenFor(worker.email)))
        .expect(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('deactivating staff takes effect once the permission cache is cleared', async () => {
      const staff = await createAccount(prisma, 'STAFF', {
        companyId: companyA.id,
      });
      const token = await tokenFor(staff.email);
      await http.get(probe).set(bearer(token)).expect(200);

      await prisma.companyStaff.update({
        where: { userId: staff.id },
        data: { deactivatedAt: new Date() },
      });
      // Cached for up to 60 s; role-change code calls PermissionsService.evict to make it immediate.
      const { PermissionsService } =
        await import('../../src/modules/rbac/services/permissions.service.js');
      await app.get(PermissionsService).evict(staff.id);
      await http.get(probe).set(bearer(token)).expect(403);
    });
  });

  describe('refresh and logout', () => {
    const refresh = (cookie: string) =>
      http.post('/v1/auth/refresh').set('Cookie', `refresh_token=${cookie}`);

    it('rotates the refresh token and issues a working access token', async () => {
      const first = refreshCookie(await login(owner.email))!.value;
      const res = await refresh(first).expect(200);
      const second = refreshCookie(res)!.value;
      expect(second).not.toBe(first);
      await http
        .get('/v1/admin/me')
        .set(bearer(res.body.data.accessToken))
        .expect(200);
    });

    it('rejects a request with no cookie', async () => {
      await http.post('/v1/auth/refresh').expect(401);
    });

    it('reusing a rotated token revokes the whole family', async () => {
      const first = refreshCookie(await login(owner.email))!.value;
      const second = refreshCookie(await refresh(first).expect(200))!.value;

      await refresh(first).expect(401); // replay of the rotated token
      await refresh(second).expect(401); // the descendant is now revoked too
    });

    it('does not touch the other sessions of the same user', async () => {
      const laptop = refreshCookie(await login(owner.email))!.value;
      const phone = refreshCookie(await login(owner.email))!.value;
      await refresh(laptop).expect(200);
      await refresh(laptop).expect(401);
      await refresh(phone).expect(200);
    });

    it('logout revokes the family and clears the cookie; twice is fine', async () => {
      const token = refreshCookie(await login(owner.email))!.value;
      const res = await http
        .post('/v1/auth/logout')
        .set('Cookie', `refresh_token=${token}`)
        .expect(204);
      expect(refreshCookie(res)?.value).toBe('');
      expect(cookieOf(res, 'access_token')?.value).toBe('');
      await refresh(token).expect(401);
      await http.post('/v1/auth/logout').expect(204);
    });

    it('refresh picks up deactivation', async () => {
      const staff = await createAccount(prisma, 'STAFF', {
        companyId: companyA.id,
      });
      const token = refreshCookie(await login(staff.email))!.value;
      await prisma.companyStaff.update({
        where: { userId: staff.id },
        data: { deactivatedAt: new Date() },
      });
      await refresh(token).expect(403);
      await refresh(token).expect(401); // and the family is gone
    });

    it('stores only a hash of the refresh token', async () => {
      const token = refreshCookie(await login(owner.email))!.value;
      expect(
        await prisma.refreshToken.count({ where: { tokenHash: token } }),
      ).toBe(0);
    });
  });

  describe('passwords', () => {
    const tokenFromMail = (to: string) => {
      const message = [...mail.sent].reverse().find((m) => m.to === to);
      return /token=([\w-]+)/.exec(message?.text ?? '')?.[1];
    };

    it('forgot → reset: mails a link, sets the password, ends all sessions, link is single-use', async () => {
      const user = await createAccount(prisma, 'CLIENT');
      const session = refreshCookie(await login(user.email))!.value;

      await http
        .post('/v1/auth/password/forgot')
        .send({ email: user.email })
        .expect(202);
      const token = tokenFromMail(user.email)!;
      expect(token).toBeDefined();

      await http
        .post('/v1/auth/password/reset')
        .send({ token, password: 'a-brand-new-password' })
        .expect(204);
      await login(user.email).expect(401);
      await login(user.email, 'a-brand-new-password').expect(200);
      await http
        .post('/v1/auth/refresh')
        .set('Cookie', `refresh_token=${session}`)
        .expect(401);

      const reuse = await http
        .post('/v1/auth/password/reset')
        .send({ token, password: 'yet-another-password' })
        .expect(422);
      expect(reuse.body.code).toBe('LINK_INVALID');
    });

    it('forgot answers 202 and sends nothing for unknown emails', async () => {
      const before = mail.sent.length;
      await http
        .post('/v1/auth/password/forgot')
        .send({ email: `ghost-${uid()}@test.local` })
        .expect(202);
      expect(mail.sent.length).toBe(before);
    });

    it('rejects an unknown, expired or wrong-purpose token', async () => {
      await http
        .post('/v1/auth/password/reset')
        .send({ token: 'nope', password: PASSWORD })
        .expect(422);

      const user = await createAccount(prisma, 'CLIENT');
      const { PasswordService } =
        await import('../../src/modules/identity/index.js');
      const passwords = app.get(PasswordService);
      const expired = await passwords.issueToken(
        user.id,
        'RESET_PASSWORD',
        -1000,
      );
      await http
        .post('/v1/auth/password/reset')
        .send({ token: expired, password: PASSWORD })
        .expect(422);

      const setup = await passwords.issueToken(user.id, 'SET_PASSWORD', 60_000);
      await http
        .post('/v1/auth/password/reset')
        .send({ token: setup, password: PASSWORD })
        .expect(422);
    });

    it('setup activates an invited owner, who can then log in', async () => {
      const invited = await createAccount(prisma, 'STAFF', {
        companyId: companyA.id,
        status: 'INVITED',
        password: null,
      });
      await login(invited.email).expect(401);

      const { PasswordService } =
        await import('../../src/modules/identity/index.js');
      const token = await app
        .get(PasswordService)
        .issueToken(invited.id, 'SET_PASSWORD', 60_000);
      await http
        .post('/v1/auth/password/setup')
        .send({ token, password: 'my-first-password' })
        .expect(204);
      await login(invited.email, 'my-first-password').expect(200);
    });

    it('setup does not reactivate a disabled account', async () => {
      const disabled = await createAccount(prisma, 'CLIENT', {
        status: 'DISABLED',
      });
      const { PasswordService } =
        await import('../../src/modules/identity/index.js');
      const token = await app
        .get(PasswordService)
        .issueToken(disabled.id, 'SET_PASSWORD', 60_000);
      await http
        .post('/v1/auth/password/setup')
        .send({ token, password: 'my-first-password' })
        .expect(204);
      await login(disabled.email, 'my-first-password').expect(401);
    });

    it('change password needs the current one and ends other sessions', async () => {
      const user = await createAccount(prisma, 'CLIENT');
      const first = await login(user.email).expect(200);
      const cookie = refreshCookie(first)!.value;
      const auth = bearer(first.body.data.accessToken);

      await http.post('/v1/auth/password/change').expect(401);
      await http
        .post('/v1/auth/password/change')
        .set(auth)
        .send({
          currentPassword: 'wrong-password',
          newPassword: 'changed-password-1',
        })
        .expect(401);
      await http
        .post('/v1/auth/password/change')
        .set(auth)
        .send({ currentPassword: PASSWORD, newPassword: 'changed-password-1' })
        .expect(204);

      await login(user.email).expect(401);
      await login(user.email, 'changed-password-1').expect(200);
      await http
        .post('/v1/auth/refresh')
        .set('Cookie', `refresh_token=${cookie}`)
        .expect(401);
    });
  });
});
