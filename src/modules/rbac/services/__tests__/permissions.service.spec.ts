import type { Redis } from 'ioredis';
import { mockDeep } from 'vitest-mock-extended';
import { PrismaService } from '../../../../infra/prisma/prisma.service.js';
import {
  ALL_PERMISSIONS,
  Permission,
} from '../../../../common/auth/permissions.js';
import { PermissionsService } from '../permissions.service.js';

describe('PermissionsService', () => {
  const build = (staff: unknown) => {
    const prisma = mockDeep<PrismaService>();
    prisma.companyStaff.findUnique.mockResolvedValue(staff as never);
    const redis = mockDeep<Redis>();
    redis.get.mockResolvedValue(null as never);
    return { prisma, redis, service: new PermissionsService(prisma, redis) };
  };

  it('gives a super admin every permission without touching the database', async () => {
    const { prisma, service } = build(null);
    const held = await service.forUser({ id: 'a', kind: 'SUPER_ADMIN' });
    expect([...held].sort()).toEqual([...ALL_PERMISSIONS].sort());
    expect(prisma.companyStaff.findUnique).not.toHaveBeenCalled();
  });

  it('gives staff the permissions of their role', async () => {
    const { service } = build({
      deactivatedAt: null,
      role: { permissions: [{ permission: { code: Permission.ShowRead } }] },
    });
    const held = await service.forUser({
      id: 's',
      kind: 'STAFF',
      companyId: 'c',
    });
    expect([...held]).toEqual([Permission.ShowRead]);
  });

  it('gives deactivated or unknown staff nothing', async () => {
    const deactivated = build({
      deactivatedAt: new Date(),
      role: { permissions: [] },
    });
    expect(
      (await deactivated.service.forUser({ id: 's', kind: 'STAFF' })).size,
    ).toBe(0);
    const unknown = build(null);
    expect(
      (await unknown.service.forUser({ id: 's', kind: 'STAFF' })).size,
    ).toBe(0);
  });

  it('gives customers nothing', async () => {
    const { service } = build(null);
    expect((await service.forUser({ id: 'c', kind: 'CLIENT' })).size).toBe(0);
  });

  it('caches staff permissions for 60 s and serves the next call from the cache', async () => {
    const { prisma, redis, service } = build({
      deactivatedAt: null,
      role: { permissions: [{ permission: { code: Permission.ShowRead } }] },
    });
    const staff = { id: 's', kind: 'STAFF' as const, companyId: 'c' };
    await service.forUser(staff);
    expect(redis.set).toHaveBeenCalledWith(
      'permissions:s',
      JSON.stringify([Permission.ShowRead]),
      'EX',
      60,
    );

    redis.get.mockResolvedValue(JSON.stringify([Permission.ShowRead]) as never);
    prisma.companyStaff.findUnique.mockClear();
    const held = await service.forUser(staff);
    expect([...held]).toEqual([Permission.ShowRead]);
    expect(prisma.companyStaff.findUnique).not.toHaveBeenCalled();
  });

  it('evict drops the cached entry', async () => {
    const { redis, service } = build(null);
    await service.evict('s');
    expect(redis.del).toHaveBeenCalledWith('permissions:s');
  });

  it('falls back to the database when Redis is down', async () => {
    const { redis, service } = build({
      deactivatedAt: null,
      role: { permissions: [{ permission: { code: Permission.ShowRead } }] },
    });
    redis.get.mockRejectedValue(new Error('down') as never);
    redis.set.mockRejectedValue(new Error('down') as never);
    const held = await service.forUser({ id: 's', kind: 'STAFF' });
    expect([...held]).toEqual([Permission.ShowRead]);
  });
});
