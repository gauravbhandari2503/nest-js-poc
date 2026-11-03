import argon2 from 'argon2';
import { INDIA_CITIES } from '../../prisma/seed/cities.js';
import { runSeed } from '../../prisma/seed/run.js';
import {
  ALL_PERMISSIONS,
  SYSTEM_ROLE_PERMISSIONS,
} from '../../src/common/auth/permissions.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestPrisma, uid } from './helpers.js';

describe('seed', () => {
  let prisma: PrismaClient;
  const options = {
    adminEmail: 'seed-admin@test.local',
    adminPassword: 'seed-admin-password',
  };
  const cityCount = Object.values(INDIA_CITIES).flat().length;

  const counts = async () => ({
    permissions: await prisma.permission.count(),
    systemRoles: await prisma.role.count({ where: { companyId: null } }),
    rolePermissions: await prisma.rolePermission.count(),
    taxRates: await prisma.taxRate.count(),
    admins: await prisma.user.count({ where: { email: options.adminEmail } }),
    seededCities: await prisma.city.count({
      where: { OR: Object.keys(INDIA_CITIES).map((state) => ({ state })) },
    }),
  });

  beforeAll(async () => {
    prisma = createTestPrisma();
    await runSeed(prisma, options);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('running twice leaves every row count unchanged', async () => {
    const before = await counts();
    await runSeed(prisma, options);
    expect(await counts()).toEqual(before);
  });

  it('seeds every permission, both system roles, tax rates and all cities', async () => {
    const result = await counts();
    expect(result.permissions).toBe(ALL_PERMISSIONS.length);
    expect(result.systemRoles).toBe(
      Object.keys(SYSTEM_ROLE_PERMISSIONS).length,
    );
    expect(result.taxRates).toBe(3);
    expect(result.seededCities).toBe(cityCount);
  });

  it('gives the owner role every permission and maintenance staff only its own', async () => {
    for (const [name, codes] of Object.entries(SYSTEM_ROLE_PERMISSIONS)) {
      const role = await prisma.role.findFirstOrThrow({
        where: { name, companyId: null },
        include: { permissions: { include: { permission: true } } },
      });
      expect(role.permissions.map((p) => p.permission.code).sort()).toEqual(
        [...codes].sort(),
      );
    }
    const owner = await prisma.role.findFirstOrThrow({
      where: { name: 'COMPANY_OWNER', companyId: null },
      include: { permissions: true },
    });
    expect(owner.permissions).toHaveLength(ALL_PERMISSIONS.length);
  });

  it('creates an active super admin whose password verifies, and never resets it', async () => {
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: options.adminEmail },
    });
    expect(admin).toMatchObject({ kind: 'SUPER_ADMIN', status: 'ACTIVE' });
    expect(admin.passwordHash).toMatch(/^\$argon2id\$/);
    expect(
      await argon2.verify(admin.passwordHash!, options.adminPassword),
    ).toBe(true);

    await runSeed(prisma, {
      ...options,
      adminPassword: 'a-different-password',
    });
    const after = await prisma.user.findUniqueOrThrow({
      where: { email: options.adminEmail },
    });
    expect(after.passwordHash).toBe(admin.passwordHash);
  });

  it('removes a permission that is no longer in code and restores a missing role grant', async () => {
    await prisma.permission.create({
      data: { code: 'obsolete.permission', description: 'x' },
    });
    const owner = await prisma.role.findFirstOrThrow({
      where: { name: 'COMPANY_OWNER', companyId: null },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: owner.id } });

    await runSeed(prisma, options);

    expect(
      await prisma.permission.count({ where: { code: 'obsolete.permission' } }),
    ).toBe(0);
    expect(
      await prisma.rolePermission.count({ where: { roleId: owner.id } }),
    ).toBe(ALL_PERMISSIONS.length);
  });

  it('refuses to adopt an existing non-admin user as the super admin', async () => {
    // Unique per run: the test database is shared and never truncated.
    const email = `not-an-admin-${uid()}@test.local`;
    await prisma.user.create({
      data: {
        kind: 'CLIENT',
        email,
        fullName: 'Customer',
        status: 'ACTIVE',
      },
    });
    await expect(
      runSeed(prisma, { ...options, adminEmail: email }),
    ).rejects.toThrow(/already exists as CLIENT/);
  });
});
