import { mockDeep } from 'vitest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ALL_PERMISSIONS, Permission } from './permissions.js';
import { PermissionsService } from './permissions.service.js';

describe('PermissionsService', () => {
  const build = (staff: unknown) => {
    const prisma = mockDeep<PrismaService>();
    prisma.companyStaff.findUnique.mockResolvedValue(staff as never);
    return { prisma, service: new PermissionsService(prisma) };
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
});
