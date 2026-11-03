import { Reflector } from '@nestjs/core';
import { mock } from 'vitest-mock-extended';
import type { AuthenticatedUser } from '../../authenticated-user.js';
import {
  ClientOnly,
  PlatformOnly,
  RequirePermissions,
  StaffOnly,
} from '../../auth.decorators.js';
import { Permission } from '../../permissions.js';
import { PermissionsGuard } from '../permissions.guard.js';
import type { PermissionsLookup } from '../../permissions-lookup.js';
import { fakeContext } from './testing.js';

class AdminController {
  @RequirePermissions(Permission.ShowManage)
  create() {}
  list() {}
}
StaffOnly()(AdminController);
@PlatformOnly()
class PlatformController {
  list() {}
}
@ClientOnly()
class ClientController {
  list() {}
}

const staff: AuthenticatedUser = { id: 's', kind: 'STAFF', companyId: 'c' };
const admin: AuthenticatedUser = { id: 'a', kind: 'SUPER_ADMIN' };
const client: AuthenticatedUser = { id: 'c', kind: 'CLIENT' };

describe('PermissionsGuard', () => {
  const permissions = mock<PermissionsLookup>();
  const guard = new PermissionsGuard(new Reflector(), permissions);
  const run = (
    cls: new () => unknown,
    handler: () => void,
    user?: AuthenticatedUser,
  ) =>
    guard.canActivate(
      fakeContext({ handler, cls: cls as never }, { user }).context,
    );

  beforeEach(() => {
    permissions.forUser.mockImplementation(async (user) =>
      user.kind === 'STAFF'
        ? new Set([Permission.ShowRead])
        : new Set(Object.values(Permission)),
    );
  });

  it('allows staff with the permission, rejects staff without it', async () => {
    await expect(
      run(AdminController, AdminController.prototype.list, staff),
    ).resolves.toBe(true);
    await expect(
      run(AdminController, AdminController.prototype.create, staff),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });

  it('lets the super admin through company routes that need a permission', async () => {
    await expect(
      run(AdminController, AdminController.prototype.create, admin),
    ).resolves.toBe(true);
  });

  it('keeps staff and customers off platform routes', async () => {
    await expect(
      run(PlatformController, PlatformController.prototype.list, staff),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      run(PlatformController, PlatformController.prototype.list, client),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      run(PlatformController, PlatformController.prototype.list, admin),
    ).resolves.toBe(true);
  });

  it('keeps staff and the super admin off customer routes', async () => {
    await expect(
      run(ClientController, ClientController.prototype.list, client),
    ).resolves.toBe(true);
    await expect(
      run(ClientController, ClientController.prototype.list, staff),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      run(ClientController, ClientController.prototype.list, admin),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('requires authentication', async () => {
    await expect(
      run(AdminController, AdminController.prototype.list),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});
