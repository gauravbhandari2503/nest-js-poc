import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import { mock, mockDeep } from 'vitest-mock-extended';
import { PrismaService } from '../../../infra/prisma/prisma.service.js';
import type { AuthenticatedUser } from '../../auth/authenticated-user.js';
import {
  CompanyOptional,
  PlatformOnly,
  StaffOnly,
} from '../../auth/auth.decorators.js';
import { fakeContext } from '../../auth/guards/__tests__/testing.js';
import { DomainError } from '../../errors/domain-error.js';
import { TenantContext } from '../tenant-context.js';
import { TenantContextGuard } from '../tenant-context.guard.js';

@StaffOnly()
class CompanyController {
  list() {}
}
@StaffOnly()
class OptionalController {
  @CompanyOptional()
  me() {}
}
@PlatformOnly()
class PlatformController {
  list() {}
}

const COMPANY_A = '0194d0a0-0000-7000-8000-00000000000a';
const COMPANY_B = '0194d0a0-0000-7000-8000-00000000000b';
const staff: AuthenticatedUser = {
  id: 'u1',
  kind: 'STAFF',
  companyId: COMPANY_A,
};
const admin: AuthenticatedUser = { id: 'u2', kind: 'SUPER_ADMIN' };
const client: AuthenticatedUser = { id: 'u3', kind: 'CLIENT' };

describe('TenantContextGuard', () => {
  const company = { id: COMPANY_B };
  let prisma: ReturnType<typeof mockDeep<PrismaService>>;
  let tenant: TenantContext;
  let guard: TenantContextGuard;

  const company$ = (user: AuthenticatedUser | undefined, headers = {}) =>
    fakeContext(
      { handler: CompanyController.prototype.list, cls: CompanyController },
      { user, headers },
    );

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    prisma.company.findUnique.mockImplementation(((args: {
      where: { id: string };
    }) =>
      Promise.resolve(args.where.id === company.id ? company : null)) as never);
    tenant = new TenantContext(mock<ClsService>());
    vi.spyOn(tenant, 'set');
    guard = new TenantContextGuard(new Reflector(), tenant, prisma);
  });

  it('uses the staff token company and ignores the header', async () => {
    const { context, req } = company$(staff, { 'x-company-id': COMPANY_B });
    await guard.canActivate(context);
    expect(req.companyId).toBe(COMPANY_A);
    expect(tenant.set).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: COMPANY_A, actingAs: false }),
    );
    expect(prisma.company.findUnique).not.toHaveBeenCalled();
  });

  it('lets a super admin act on the company in the header', async () => {
    const { context, req } = company$(admin, { 'x-company-id': COMPANY_B });
    await guard.canActivate(context);
    expect(req.companyId).toBe(COMPANY_B);
    expect(tenant.set).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: COMPANY_B, actingAs: true }),
    );
  });

  it('rejects a super admin without the header (400)', async () => {
    await expect(
      guard.canActivate(company$(admin).context),
    ).rejects.toMatchObject({
      code: 'COMPANY_CONTEXT_REQUIRED',
      status: 400,
    });
  });

  it('lets a super admin call a @CompanyOptional route without the header', async () => {
    const { context, req } = fakeContext(
      { handler: OptionalController.prototype.me, cls: OptionalController },
      { user: admin, headers: {} },
    );
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(req.companyId).toBeUndefined();
    expect(tenant.set).toHaveBeenCalledWith(
      expect.objectContaining({ actingAs: false }),
    );
  });

  it('still validates a header sent to a @CompanyOptional route', async () => {
    const { context } = fakeContext(
      { handler: OptionalController.prototype.me, cls: OptionalController },
      { user: admin, headers: { 'x-company-id': 'nope' } },
    );
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      code: 'COMPANY_CONTEXT_REQUIRED',
    });
  });

  it('rejects a header that is not a uuid (400)', async () => {
    const { context } = company$(admin, { 'x-company-id': 'not-a-uuid' });
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      code: 'COMPANY_CONTEXT_REQUIRED',
    });
  });

  it('returns 404 for a company that does not exist', async () => {
    const { context } = company$(admin, { 'x-company-id': COMPANY_A });
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    });
  });

  it('forbids customers on company routes', async () => {
    const { context } = company$(client, { 'x-company-id': COMPANY_A });
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('forbids a staff token without a company', async () => {
    await expect(
      guard.canActivate(company$({ id: 'u4', kind: 'STAFF' }).context),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it('requires authentication', async () => {
    await expect(
      guard.canActivate(company$(undefined).context),
    ).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('does not set a company on platform routes', async () => {
    const { context, req } = fakeContext(
      { handler: PlatformController.prototype.list, cls: PlatformController },
      { user: admin, headers: { 'x-company-id': COMPANY_B } },
    );
    await guard.canActivate(context);
    expect(req.companyId).toBeUndefined();
    expect(tenant.set).toHaveBeenCalledWith({
      userId: 'u2',
      kind: 'SUPER_ADMIN',
      actingAs: false,
    });
  });
});
