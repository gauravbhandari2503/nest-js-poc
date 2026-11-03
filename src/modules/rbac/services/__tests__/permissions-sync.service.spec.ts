import { mockDeep } from 'vitest-mock-extended';
import { PrismaService } from '../../../../infra/prisma/prisma.service.js';
import { ALL_PERMISSIONS } from '../../../../common/auth/permissions.js';
import { PermissionsSyncService } from '../permissions-sync.service.js';

describe('PermissionsSyncService', () => {
  const build = (codes: string[]) => {
    const prisma = mockDeep<PrismaService>();
    prisma.permission.findMany.mockResolvedValue(
      codes.map((code) => ({ code })) as never,
    );
    return new PermissionsSyncService(prisma);
  };

  it('passes when the table matches the code', async () => {
    await expect(
      build([...ALL_PERMISSIONS]).onApplicationBootstrap(),
    ).resolves.toBeUndefined();
  });

  it('fails when a permission is missing from the database', async () => {
    await expect(
      build(ALL_PERMISSIONS.slice(1)).onApplicationBootstrap(),
    ).rejects.toThrow(/Missing in database: \[company\.manage\]/);
  });

  it('fails when the database has a permission the code does not know', async () => {
    await expect(
      build([
        ...ALL_PERMISSIONS,
        'obsolete.permission',
      ]).onApplicationBootstrap(),
    ).rejects.toThrow(/obsolete\.permission/);
  });
});
