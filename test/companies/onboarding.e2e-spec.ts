import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { runSeed } from '../../prisma/seed/run.js';
import {
  ALL_PERMISSIONS,
  SystemRole,
} from '../../src/common/auth/permissions.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { OutboxHandlerRegistry } from '../../src/infra/outbox/outbox-handler.registry.js';
import { PrismaService } from '../../src/infra/prisma/prisma.service.js';
import { SetPasswordMailHandler } from '../../src/modules/identity/jobs/set-password-mail.handler.js';
import { AuthTokenService } from '../../src/modules/identity/services/auth-token.service.js';
import {
  type CapturedMail,
  createAccount,
  createApp,
  createTenant,
  PASSWORD,
} from '../auth/helpers.js';
import { createTestPrisma, uid } from '../db/helpers.js';

describe('company onboarding (HTTP)', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let mail: CapturedMail;
  let http: ReturnType<typeof request>;
  let admin: { id: string; email: string };

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const tokenFor = async (email: string): Promise<string> =>
    (await http.post('/v1/auth/login').send({ email, password: PASSWORD })).body
      .data.accessToken;

  const body = (overrides: Record<string, unknown> = {}) => {
    const id = uid();
    return {
      name: `Starlight Cinemas ${id}`,
      salesCommissionPercent: 10,
      membershipCommissionPercent: 5.5,
      registrationFee: 500_000,
      cancellationPolicy: 'Free until 2 hours before the show',
      refundPolicy: 'Decided by staff',
      owner: { fullName: 'Asha Rao', email: `owner-${id}@test.local` },
      ...overrides,
    };
  };

  let adminToken: string;
  const onboard = (payload: object) =>
    http.post('/v1/platform/companies').set(bearer(adminToken)).send(payload);

  beforeAll(async () => {
    prisma = createTestPrisma();
    await runSeed(prisma, {
      adminEmail: process.env['SEED_ADMIN_EMAIL']!,
      adminPassword: process.env['SEED_ADMIN_PASSWORD']!,
    });
    ({ app, mail } = await createApp());
    await app.listen(0);
    http = request(app.getHttpServer());
    admin = await createAccount(prisma, 'SUPER_ADMIN');
    adminToken = await tokenFor(admin.email);
  });

  afterAll(async () => {
    // Nothing here runs the dispatcher, and unclaimed events would pile up in the shared
    // outbox table until they crowd out other tests' events.
    await prisma.outboxEvent.deleteMany({
      where: { type: 'user.set_password_requested' },
    });
    await app.close();
    await prisma.$disconnect();
  });

  const newHandler = () =>
    new SetPasswordMailHandler(
      app.get(ConfigService),
      app.get(OutboxHandlerRegistry),
      app.get(PrismaService),
      new AuthTokenService(app.get(ConfigService), app.get(PrismaService)),
      mail,
    );

  /** Runs the worker's handler for the n-th set-password event of a user; returns the link token. */
  const deliver = async (
    userId: string,
    n = 0,
  ): Promise<string | undefined> => {
    const events = await prisma.outboxEvent.findMany({
      where: { type: 'user.set_password_requested', aggregateId: userId },
      orderBy: { createdAt: 'asc' },
    });
    const event = events[n]!;
    mail.sent.length = 0;
    await newHandler().handle({
      id: event.id,
      type: event.type,
      aggregateId: event.aggregateId,
      data: (event.payload as { data: Record<string, unknown> }).data,
      attempts: 0,
    });
    return /token=([\w-]+)/.exec(mail.sent[0]?.text ?? '')?.[1];
  };

  it('creates the company, an INVITED owner, the staff record, the audit entry and the email event', async () => {
    const payload = body();
    const res = await onboard(payload).expect(201);

    const { company, owner } = res.body.data;
    expect(res.body.isSuccess).toBe(true);
    expect(company).toMatchObject({
      status: 'ACTIVE',
      salesCommissionPercent: 10,
      membershipCommissionPercent: 5.5,
      registrationFee: 500_000,
    });
    const stored = await prisma.company.findUniqueOrThrow({
      where: { id: company.id },
    });
    expect(stored).toMatchObject({
      salesCommissionBps: 1000,
      membershipCommissionBps: 550,
    });
    expect(company.slug).toMatch(/^starlight-cinemas-[0-9a-f]{8}$/);
    expect(owner).toMatchObject({
      email: payload.owner.email,
      status: 'INVITED',
      employeeId: `bmt_${owner.userId}`,
    });

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: owner.userId },
    });
    expect(user).toMatchObject({ kind: 'STAFF', passwordHash: null });
    const staff = await prisma.companyStaff.findUniqueOrThrow({
      where: { userId: owner.userId },
      include: { role: true },
    });
    expect(staff).toMatchObject({
      companyId: company.id,
      isOwner: true,
      employeeId: `bmt_${owner.userId}`,
    });
    expect(staff.role.name).toBe(SystemRole.CompanyOwner);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityType: 'company', entityId: company.id },
    });
    expect(audit).toMatchObject({
      actorId: admin.id,
      actorKind: 'SUPER_ADMIN',
      companyId: company.id,
      module: 'companies',
      action: 'company.onboarded',
    });
    expect(audit.correlationId).toBe(res.body.correlationId);
    expect(JSON.stringify(audit.after)).not.toMatch(/password|token/i);

    const event = await prisma.outboxEvent.findFirstOrThrow({
      where: { type: 'user.set_password_requested', aggregateId: owner.userId },
    });
    expect(JSON.stringify(event.payload)).not.toContain('token');
  });

  it('keeps an employee ID the company gave, and allows the same ID in another company', async () => {
    const owner = (employeeId: string) => ({
      fullName: 'Ravi',
      email: `o-${uid()}@test.local`,
      employeeId,
    });
    const a = await onboard(body({ owner: owner('  EMP-001 ') })).expect(201);
    const b = await onboard(body({ owner: owner('EMP-001') })).expect(201);
    expect(a.body.data.owner.employeeId).toBe('EMP-001');
    expect(b.body.data.owner.employeeId).toBe('EMP-001');

    // Unique inside one company.
    const staff = await createAccount(prisma, 'CLIENT');
    const role = await prisma.role.findFirstOrThrow({
      where: { name: SystemRole.MaintenanceStaff, companyId: null },
    });
    await expect(
      prisma.companyStaff.create({
        data: {
          companyId: a.body.data.company.id,
          userId: staff.id,
          roleId: role.id,
          employeeId: 'EMP-001',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('rejects a taken slug or owner email and creates nothing', async () => {
    const slug = `taken-${uid()}`;
    const first = body({ slug });
    await onboard(first).expect(201);

    const sameSlug = body({ slug });
    const slugRes = await onboard(sameSlug).expect(409);
    expect(slugRes.body.code).toBe('COMPANY_SLUG_TAKEN');
    expect(await prisma.company.count({ where: { name: sameSlug.name } })).toBe(
      0,
    );

    const sameEmail = body({ owner: first.owner });
    const emailRes = await onboard(sameEmail).expect(409);
    expect(emailRes.body.code).toBe('EMAIL_TAKEN');
    expect(
      await prisma.company.count({ where: { name: sameEmail.name } }),
    ).toBe(0);
  });

  it('validates the body', async () => {
    const res = await onboard(
      body({
        salesCommissionPercent: 120,
        owner: { fullName: 'X', email: 'nope', employeeId: 'has space' },
        extra: true,
      }),
    ).expect(422);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    const fields = (res.body.errors as { field: string }[]).map((e) => e.field);
    expect(fields).toEqual(
      expect.arrayContaining([
        'salesCommissionPercent',
        'owner.email',
        'owner.employeeId',
        'extra',
      ]),
    );
  });

  it('is for the super admin only', async () => {
    await http.post('/v1/platform/companies').send(body()).expect(401);

    const company = await createTenant(prisma, admin.id);
    const staff = await createAccount(prisma, 'STAFF', {
      companyId: company.id,
    });
    const client = await createAccount(prisma, 'CLIENT');
    for (const user of [staff, client]) {
      await http
        .post('/v1/platform/companies')
        .set(bearer(await tokenFor(user.email)))
        .send(body())
        .expect(403);
    }
  });

  it('emails the owner a link that sets the password, activates the account and logs in', async () => {
    const res = await onboard(body()).expect(201);
    const { company, owner } = res.body.data;

    const token = await deliver(owner.userId);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]!.to).toBe(owner.email);
    expect(token).toBeDefined();

    await http
      .post('/v1/auth/password/setup')
      .send({ token, password: PASSWORD })
      .expect(204);
    const login = await http
      .post('/v1/auth/login')
      .send({ email: owner.email, password: PASSWORD })
      .expect(200);
    expect(login.body.data.user).toMatchObject({
      kind: 'STAFF',
      companyId: company.id,
    });

    const me = await http
      .get('/v1/auth/me')
      .set(bearer(login.body.data.accessToken))
      .expect(200);
    expect(me.body.data).toMatchObject({
      company: { id: company.id },
      isOwner: true,
      employeeId: `bmt_${owner.userId}`,
    });
    expect(me.body.data.permissions).toEqual([...ALL_PERMISSIONS].sort());

    // At-least-once delivery: a repeat after the password is set sends nothing.
    await deliver(owner.userId);
    expect(mail.sent).toHaveLength(0);
  });

  it('resends the invitation: the new link works and the old one stops', async () => {
    const res = await onboard(body()).expect(201);
    const { company, owner } = res.body.data;
    const url = `/v1/platform/companies/${company.id}/owner/resend-invitation`;

    const first = await deliver(owner.userId, 0);
    await http.post(url).set(bearer(adminToken)).expect(202);
    const second = await deliver(owner.userId, 1);
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(second).not.toBe(first);

    const old = await http
      .post('/v1/auth/password/setup')
      .send({ token: first, password: PASSWORD })
      .expect(422);
    expect(old.body.code).toBe('LINK_INVALID');
    await http
      .post('/v1/auth/password/setup')
      .send({ token: second, password: PASSWORD })
      .expect(204);

    expect(
      await prisma.auditLog.count({
        where: {
          companyId: company.id,
          action: 'company.owner_invitation_resent',
        },
      }),
    ).toBe(1);

    const again = await http.post(url).set(bearer(adminToken)).expect(409);
    expect(again.body.code).toBe('INVALID_STATE_TRANSITION');
  });

  it('answers 404 for an unknown company and is for the super admin only', async () => {
    await http
      .post(
        '/v1/platform/companies/0194d0a0-0000-7000-8000-0000000000ff/owner/resend-invitation',
      )
      .set(bearer(adminToken))
      .expect(404);

    const company = await createTenant(prisma, admin.id);
    const staff = await createAccount(prisma, 'STAFF', {
      companyId: company.id,
      isOwner: true,
    });
    const url = `/v1/platform/companies/${company.id}/owner/resend-invitation`;
    await http.post(url).expect(401);
    await http
      .post(url)
      .set(bearer(await tokenFor(staff.email)))
      .expect(403);
  });
});
