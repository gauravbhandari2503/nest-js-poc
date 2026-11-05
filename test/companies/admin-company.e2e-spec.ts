import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { runSeed } from '../../prisma/seed/run.js';
import { SystemRole } from '../../src/common/auth/permissions.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import {
  createAccount,
  createApp,
  createTenant,
  PASSWORD,
} from '../auth/helpers.js';
import { createTestPrisma } from '../db/helpers.js';

describe('admin company (HTTP)', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let admin: { id: string; email: string };
  let companyA: { id: string };
  let companyB: { id: string };
  let ownerA: { id: string; email: string };
  let staffA: { id: string; email: string };

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const tokenFor = async (email: string): Promise<string> =>
    (await http.post('/v1/auth/login').send({ email, password: PASSWORD })).body
      .data.accessToken;

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
    companyA = await createTenant(prisma, admin.id);
    companyB = await createTenant(prisma, admin.id);
    ownerA = await createAccount(prisma, 'STAFF', { companyId: companyA.id });
    staffA = await createAccount(prisma, 'STAFF', {
      companyId: companyA.id,
      roleName: SystemRole.MaintenanceStaff,
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('PATCH /v1/admin/company', () => {
    it('lets the owner edit the policies and audits it for their company', async () => {
      const res = await http
        .patch('/v1/admin/company')
        .set(bearer(await tokenFor(ownerA.email)))
        .send({
          cancellationPolicy: '  Free cancellation, full refund.  ',
          refundPolicy: 'Approved by management first.',
        })
        .expect(200);
      expect(res.body.data).toMatchObject({
        id: companyA.id,
        cancellationPolicy: 'Free cancellation, full refund.',
        refundPolicy: 'Approved by management first.',
      });

      const entry = await prisma.auditLog.findFirstOrThrow({
        where: { companyId: companyA.id, action: 'company.policy_updated' },
      });
      expect(entry).toMatchObject({
        actorId: ownerA.id,
        actorKind: 'STAFF',
        before: { cancellationPolicy: 'none', refundPolicy: 'none' },
      });
    });

    it('never touches another company', async () => {
      const before = await prisma.company.findUniqueOrThrow({
        where: { id: companyB.id },
      });
      await http
        .patch('/v1/admin/company')
        .set({
          ...bearer(await tokenFor(ownerA.email)),
          'X-Company-Id': companyB.id,
        })
        .send({ refundPolicy: 'Changed by the wrong company' })
        .expect(200);
      const other = await prisma.company.findUniqueOrThrow({
        where: { id: companyB.id },
      });
      expect(other.refundPolicy).toBe(before.refundPolicy);
    });

    it('lets the super admin edit a company named in the header, and needs it', async () => {
      const token = await tokenFor(admin.email);
      await http
        .patch('/v1/admin/company')
        .set(bearer(token))
        .send({ refundPolicy: 'x' })
        .expect(400);
      const res = await http
        .patch('/v1/admin/company')
        .set({ ...bearer(token), 'X-Company-Id': companyB.id })
        .send({ refundPolicy: 'Set by the platform' })
        .expect(200);
      expect(res.body.data).toMatchObject({
        id: companyB.id,
        refundPolicy: 'Set by the platform',
      });
      expect(res.body.data).not.toHaveProperty('salesCommissionPercent');
    });

    it('is closed to customers', async () => {
      const client = await createAccount(prisma, 'CLIENT');
      await http
        .patch('/v1/admin/company')
        .set(bearer(await tokenFor(client.email)))
        .send({ refundPolicy: 'x' })
        .expect(403);
    });

    it('needs the company.manage permission', async () => {
      const staffToken = await tokenFor(staffA.email);
      await http
        .patch('/v1/admin/company')
        .set(bearer(staffToken))
        .send({ refundPolicy: 'x' })
        .expect(403);
    });

    it('validates the body and writes nothing for an unchanged value', async () => {
      const token = await tokenFor(ownerA.email);
      const patch = (body: object) =>
        http.patch('/v1/admin/company').set(bearer(token)).send(body);
      await patch({}).expect(422);
      await patch({ refundPolicy: '   ' }).expect(422);
      await patch({ refundPolicy: 'x'.repeat(2001) }).expect(422);
      await patch({ name: 'Renamed' }).expect(422);

      const before = await prisma.auditLog.count({
        where: { companyId: companyA.id, action: 'company.policy_updated' },
      });
      const current = await prisma.company.findUniqueOrThrow({
        where: { id: companyA.id },
      });
      await patch({ refundPolicy: current.refundPolicy }).expect(200);
      expect(
        await prisma.auditLog.count({
          where: { companyId: companyA.id, action: 'company.policy_updated' },
        }),
      ).toBe(before);
    });
  });
});
