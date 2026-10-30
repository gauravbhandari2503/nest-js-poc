import argon2 from 'argon2';
import {
  ALL_PERMISSIONS,
  SYSTEM_ROLE_PERMISSIONS,
  type SystemRoleName,
} from '../../src/common/auth/permissions.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { INDIA_CITIES } from './cities.js';

export interface SeedOptions {
  adminEmail: string;
  adminPassword: string;
}

/** Placeholder rates in basis points: the super admin owns the real values. */
const PLACEHOLDER_TAX_RATES = [
  { itemType: 'TICKET', rateBps: 1800 },
  { itemType: 'FOOD', rateBps: 500 },
  { itemType: 'MEMBERSHIP', rateBps: 1800 },
] as const;

const TAX_RATES_EFFECTIVE_FROM = new Date('2026-01-01T00:00:00.000Z');

/**
 * Seeds the reference data the app cannot run without. Safe to run repeatedly:
 * every step is keyed on a natural unique value and never overwrites data that
 * someone may have changed since (admin password, tax rate values).
 */
export async function runSeed(prisma: PrismaClient, options: SeedOptions) {
  await seedPermissions(prisma);
  await seedSystemRoles(prisma);
  const admin = await seedSuperAdmin(prisma, options);
  await seedTaxRates(prisma, admin.id);
  await seedCities(prisma);
}

/** The `Permission` constant in code is the source of truth, so extra rows are removed. */
export async function seedPermissions(prisma: PrismaClient) {
  for (const code of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code },
      create: { code, description: code },
      update: {},
    });
  }
  await prisma.permission.deleteMany({
    where: { code: { notIn: [...ALL_PERMISSIONS] } },
  });
}

export async function seedSystemRoles(prisma: PrismaClient) {
  for (const [name, codes] of Object.entries(SYSTEM_ROLE_PERMISSIONS) as [
    SystemRoleName,
    readonly string[],
  ][]) {
    // The unique index on system role names is partial (company_id IS NULL), which
    // Prisma cannot target in an upsert, so look the role up first.
    const existing = await prisma.role.findFirst({
      where: { name, companyId: null },
    });
    const role =
      existing ??
      (await prisma.role.create({ data: { name, isSystem: true } }));

    const permissions = await prisma.permission.findMany({
      where: { code: { in: [...codes] } },
    });
    await prisma.rolePermission.deleteMany({
      where: {
        roleId: role.id,
        permissionId: { notIn: permissions.map((p) => p.id) },
      },
    });
    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
  }
}

/** Created once. An existing admin keeps their password; this never resets it. */
export async function seedSuperAdmin(
  prisma: PrismaClient,
  { adminEmail, adminPassword }: SeedOptions,
) {
  const existing = await prisma.user.findUnique({
    where: { email: adminEmail },
  });
  if (existing) {
    if (existing.kind !== 'SUPER_ADMIN') {
      throw new Error(
        `${adminEmail} already exists as ${existing.kind}, refusing to treat it as the super admin`,
      );
    }
    return existing;
  }
  return prisma.user.create({
    data: {
      kind: 'SUPER_ADMIN',
      email: adminEmail,
      passwordHash: await argon2.hash(adminPassword, { type: argon2.argon2id }),
      fullName: 'Super Admin',
      status: 'ACTIVE',
    },
  });
}

/** Tax rows are never edited: a new rate is a new row with a later `effective_from`. */
export async function seedTaxRates(prisma: PrismaClient, createdBy: string) {
  await prisma.taxRate.createMany({
    data: PLACEHOLDER_TAX_RATES.map((rate) => ({
      ...rate,
      effectiveFrom: TAX_RATES_EFFECTIVE_FROM,
      createdBy,
    })),
    skipDuplicates: true,
  });
}

export async function seedCities(prisma: PrismaClient) {
  await prisma.city.createMany({
    data: Object.entries(INDIA_CITIES).flatMap(([state, names]) =>
      names.map((name) => ({ name, state })),
    ),
    skipDuplicates: true,
  });
}
