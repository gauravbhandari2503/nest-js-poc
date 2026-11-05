import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { runSeed } from '../../prisma/seed/run.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import {
  createAccount,
  createApp,
  createTenant,
  PASSWORD,
} from '../auth/helpers.js';
import { createTestPrisma, uid } from '../db/helpers.js';

describe('platform companies and audit log (HTTP)', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let admin: { id: string; email: string };
  let adminToken: string;

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const tokenFor = async (email: string): Promise<string> =>
    (await http.post('/v1/auth/login').send({ email, password: PASSWORD })).body
      .data.accessToken;
  const asAdmin = {
    get: (url: string) => http.get(url).set(bearer(adminToken)),
    post: (url: string) => http.post(url).set(bearer(adminToken)),
    patch: (url: string) => http.patch(url).set(bearer(adminToken)),
  };

  const makeCompany = (
    name: string,
    extra: { registrationFee?: number; status?: 'ACTIVE' | 'SUSPENDED' } = {},
  ) =>
    prisma.company.create({
      data: {
        name,
        slug: `${name.toLowerCase().replaceAll(' ', '-')}-${uid()}`,
        salesCommissionBps: 1000,
        membershipCommissionBps: 500,
        registrationFee: extra.registrationFee ?? 0,
        status: extra.status ?? 'ACTIVE',
        cancellationPolicy: 'none',
        refundPolicy: 'none',
        onboardedBy: admin.id,
      },
    });

  const auditRows = (companyId: string, action?: string) =>
    prisma.auditLog.findMany({
      where: { companyId, ...(action ? { action } : {}) },
    });

  beforeAll(async () => {
    prisma = createTestPrisma();
    await runSeed(prisma, {
      adminEmail: process.env['SEED_ADMIN_EMAIL']!,
      adminPassword: process.env['SEED_ADMIN_PASSWORD']!,
    });
    ({ app } = await createApp());
    await app.listen(0);
    http = request(app.getHttpServer());
    admin = await createAccount(prisma, 'SUPER_ADMIN');
    adminToken = await tokenFor(admin.email);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('list and detail', () => {
    it('lists newest first with keyset pages, a status filter and a name search', async () => {
      const tag = `Zed${uid()}`;
      const first = await makeCompany(`${tag} One`);
      const second = await makeCompany(`${tag} Two`);
      const third = await makeCompany(`${tag} Three`, { status: 'SUSPENDED' });

      const page1 = await asAdmin
        .get(`/v1/platform/companies?q=${tag}&limit=2`)
        .expect(200);
      const data1 = page1.body.data;
      expect(data1.items.map((c: { id: string }) => c.id)).toEqual([
        third.id,
        second.id,
      ]);
      expect(data1.page.hasMore).toBe(true);

      const page2 = await asAdmin
        .get(
          `/v1/platform/companies?q=${tag}&limit=2&cursor=${data1.page.nextCursor}`,
        )
        .expect(200);
      expect(page2.body.data.items.map((c: { id: string }) => c.id)).toEqual([
        first.id,
      ]);
      expect(page2.body.data.page).toEqual({
        nextCursor: null,
        hasMore: false,
      });

      const suspended = await asAdmin
        .get(`/v1/platform/companies?q=${tag}&status=SUSPENDED`)
        .expect(200);
      expect(suspended.body.data.items).toHaveLength(1);
      expect(suspended.body.data.items[0]).toMatchObject({
        id: third.id,
        status: 'SUSPENDED',
        salesCommissionPercent: 10,
        membershipCommissionPercent: 5,
      });
    });

    it('rejects a bad cursor, status or limit', async () => {
      await asAdmin.get('/v1/platform/companies?cursor=nope').expect(422);
      await asAdmin.get('/v1/platform/companies?status=GONE').expect(422);
      await asAdmin.get('/v1/platform/companies?limit=500').expect(422);
    });

    it('shows one company with its owner', async () => {
      const company = await createTenant(prisma, admin.id);
      const owner = await createAccount(prisma, 'STAFF', {
        companyId: company.id,
        isOwner: true,
      });
      const res = await asAdmin
        .get(`/v1/platform/companies/${company.id}`)
        .expect(200);
      expect(res.body.data).toMatchObject({
        id: company.id,
        owner: {
          userId: owner.id,
          email: owner.email,
          employeeId: `bmt_${owner.id}`,
          status: 'ACTIVE',
        },
      });
    });

    it('answers 404 for an unknown company and 422 for a malformed id', async () => {
      await asAdmin
        .get('/v1/platform/companies/0194d0a0-0000-7000-8000-0000000000ff')
        .expect(404);
      const res = await asAdmin
        .get('/v1/platform/companies/not-a-uuid')
        .expect(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('rates and suspension', () => {
    it('changes a rate, stores basis points and audits before and after', async () => {
      const company = await makeCompany(`Rates ${uid()}`);
      const res = await asAdmin
        .patch(`/v1/platform/companies/${company.id}`)
        .send({ salesCommissionPercent: 12.5 })
        .expect(200);
      expect(res.body.data.salesCommissionPercent).toBe(12.5);
      expect(
        (await prisma.company.findUniqueOrThrow({ where: { id: company.id } }))
          .salesCommissionBps,
      ).toBe(1250);

      const [entry] = await auditRows(company.id, 'company.updated');
      expect(entry).toMatchObject({
        actorId: admin.id,
        before: { salesCommissionPercent: 10 },
        after: { salesCommissionPercent: 12.5 },
      });
    });

    it('writes nothing when the request changes nothing', async () => {
      const company = await makeCompany(`Same ${uid()}`);
      await asAdmin
        .patch(`/v1/platform/companies/${company.id}`)
        .send({ salesCommissionPercent: 10, status: 'ACTIVE' })
        .expect(200);
      expect(await auditRows(company.id)).toHaveLength(0);
    });

    it('suspends and reactivates; a suspended company staff cannot log in', async () => {
      const company = await createTenant(prisma, admin.id);
      const owner = await createAccount(prisma, 'STAFF', {
        companyId: company.id,
      });
      const login = () =>
        http
          .post('/v1/auth/login')
          .send({ email: owner.email, password: PASSWORD });

      await login().expect(200);
      const suspended = await asAdmin
        .patch(`/v1/platform/companies/${company.id}`)
        .send({ status: 'SUSPENDED' })
        .expect(200);
      expect(suspended.body.data.status).toBe('SUSPENDED');
      const blocked = await login().expect(403);
      expect(blocked.body.description).toBe('Company is suspended');

      await asAdmin
        .patch(`/v1/platform/companies/${company.id}`)
        .send({ status: 'ACTIVE' })
        .expect(200);
      await login().expect(200);
      expect(await auditRows(company.id, 'company.updated')).toHaveLength(2);
    });

    it('validates the body', async () => {
      const company = await makeCompany(`Bad ${uid()}`);
      const url = `/v1/platform/companies/${company.id}`;
      await asAdmin.patch(url).send({}).expect(422);
      await asAdmin
        .patch(url)
        .send({ salesCommissionPercent: 101 })
        .expect(422);
      await asAdmin
        .patch(url)
        .send({ membershipCommissionPercent: 1.234 })
        .expect(422);
      await asAdmin.patch(url).send({ status: 'DELETED' }).expect(422);
      await asAdmin.patch(url).send({ name: 'x' }).expect(422);
      await asAdmin
        .patch('/v1/platform/companies/0194d0a0-0000-7000-8000-0000000000ff')
        .send({ status: 'ACTIVE' })
        .expect(404);
    });
  });

  describe('registration fee', () => {
    it('records the payment once: marks the company and adds one income entry', async () => {
      const company = await makeCompany(`Fee ${uid()}`, {
        registrationFee: 500_000,
      });
      const url = `/v1/platform/companies/${company.id}/registration-fee`;

      const res = await asAdmin.post(url).expect(200);
      expect(res.body.data.registrationFeePaidAt).not.toBeNull();

      const entries = await prisma.ledgerEntry.findMany({
        where: { companyId: company.id },
      });
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        account: 'PLATFORM_INCOME',
        entryType: 'REGISTRATION_FEE',
        amount: 500_000,
        createdBy: admin.id,
      });
      expect(
        await auditRows(company.id, 'company.registration_fee_recorded'),
      ).toHaveLength(1);

      const again = await asAdmin.post(url).expect(409);
      expect(again.body.code).toBe('INVALID_STATE_TRANSITION');
      expect(
        await prisma.ledgerEntry.count({ where: { companyId: company.id } }),
      ).toBe(1);
    });

    it('only marks the company when the fee is zero', async () => {
      const company = await makeCompany(`Free ${uid()}`);
      await asAdmin
        .post(`/v1/platform/companies/${company.id}/registration-fee`)
        .expect(200);
      expect(
        await prisma.ledgerEntry.count({ where: { companyId: company.id } }),
      ).toBe(0);
    });

    it('answers 404 for an unknown company', async () => {
      await asAdmin
        .post(
          '/v1/platform/companies/0194d0a0-0000-7000-8000-0000000000ff/registration-fee',
        )
        .expect(404);
    });
  });

  describe('audit log search', () => {
    it('finds entries by company, action and entity, newest first, in pages', async () => {
      const company = await makeCompany(`Audit ${uid()}`);
      const url = `/v1/platform/companies/${company.id}`;
      await asAdmin.patch(url).send({ salesCommissionPercent: 11 }).expect(200);
      await asAdmin.patch(url).send({ salesCommissionPercent: 12 }).expect(200);
      await asAdmin.patch(url).send({ status: 'SUSPENDED' }).expect(200);

      const all = await asAdmin
        .get(`/v1/platform/audit-logs?companyId=${company.id}`)
        .expect(200);
      expect(all.body.data.items).toHaveLength(3);
      expect(all.body.data.items[0]).toMatchObject({
        module: 'companies',
        action: 'company.updated',
        entityType: 'company',
        entityId: company.id,
        actor: { id: admin.id, kind: 'SUPER_ADMIN', email: admin.email },
        after: { status: 'SUSPENDED' },
      });
      const times = all.body.data.items.map((e: { occurredAt: string }) =>
        Date.parse(e.occurredAt),
      );
      expect(times).toEqual([...times].sort((a, b) => b - a));

      const page1 = await asAdmin
        .get(`/v1/platform/audit-logs?companyId=${company.id}&limit=2`)
        .expect(200);
      expect(page1.body.data.items).toHaveLength(2);
      const page2 = await asAdmin
        .get(
          `/v1/platform/audit-logs?companyId=${company.id}&limit=2&cursor=${page1.body.data.page.nextCursor}`,
        )
        .expect(200);
      expect(page2.body.data.items).toHaveLength(1);
      expect(page2.body.data.page.hasMore).toBe(false);

      const byEntity = await asAdmin
        .get(
          `/v1/platform/audit-logs?entityType=company&entityId=${company.id}&action=company.updated`,
        )
        .expect(200);
      expect(byEntity.body.data.items).toHaveLength(3);
    });

    it('filters by time and rejects malformed filters', async () => {
      const company = await makeCompany(`Time ${uid()}`);
      await asAdmin
        .patch(`/v1/platform/companies/${company.id}`)
        .send({ status: 'SUSPENDED' })
        .expect(200);

      const future = new Date(Date.now() + 3_600_000).toISOString();
      const none = await asAdmin
        .get(`/v1/platform/audit-logs?companyId=${company.id}&from=${future}`)
        .expect(200);
      expect(none.body.data.items).toHaveLength(0);
      const past = new Date(Date.now() - 3_600_000).toISOString();
      const some = await asAdmin
        .get(`/v1/platform/audit-logs?companyId=${company.id}&from=${past}`)
        .expect(200);
      expect(some.body.data.items).toHaveLength(1);

      await asAdmin.get('/v1/platform/audit-logs?companyId=nope').expect(422);
      await asAdmin.get('/v1/platform/audit-logs?from=yesterday').expect(422);
    });
  });

  it('is for the super admin only', async () => {
    const company = await createTenant(prisma, admin.id);
    const staff = await createAccount(prisma, 'STAFF', {
      companyId: company.id,
    });
    const client = await createAccount(prisma, 'CLIENT');
    const calls = [
      (t?: string) => http.get('/v1/platform/companies').set(bearer(t ?? '')),
      (t?: string) =>
        http.get(`/v1/platform/companies/${company.id}`).set(bearer(t ?? '')),
      (t?: string) =>
        http
          .patch(`/v1/platform/companies/${company.id}`)
          .set(bearer(t ?? ''))
          .send({ status: 'SUSPENDED' }),
      (t?: string) =>
        http
          .post(`/v1/platform/companies/${company.id}/registration-fee`)
          .set(bearer(t ?? '')),
      (t?: string) => http.get('/v1/platform/audit-logs').set(bearer(t ?? '')),
    ];
    for (const call of calls) {
      await call().expect(401);
      for (const user of [staff, client]) {
        await call(await tokenFor(user.email)).expect(403);
      }
    }
    expect(
      (await prisma.company.findUniqueOrThrow({ where: { id: company.id } }))
        .status,
    ).toBe('ACTIVE');
  });
});
