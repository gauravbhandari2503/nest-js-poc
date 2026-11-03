import type { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Public } from '../../auth.decorators.js';
import { JwtAuthGuard } from '../jwt-auth.guard.js';
import { fakeContext } from './testing.js';

const SECRET = 'x'.repeat(32);
const ORIGIN = 'https://app.bookmyticket.test';
const USER_ID = '0199c4a2-0000-7000-8000-000000000001';

class Protected {
  list() {}
}
@Public()
class Open {
  list() {}
}

describe('JwtAuthGuard', () => {
  const jwt = new JwtService({ secret: SECRET });
  const guard = new JwtAuthGuard(new Reflector(), jwt, {
    get: () => `${ORIGIN}/`,
  } as unknown as ConfigService<never, true>);
  const run = (cls: new () => unknown, authorization?: string) => {
    const { context, req } = fakeContext(
      { handler: Protected.prototype.list, cls },
      { headers: authorization ? { authorization } : {} },
    );
    return { result: guard.canActivate(context), req };
  };

  it('lets public routes through without a token', async () => {
    await expect(run(Open).result).resolves.toBe(true);
  });

  it('sets request.user from a valid token', async () => {
    const token = await jwt.signAsync(
      { kind: 'STAFF', companyId: 'c1' },
      { subject: USER_ID, expiresIn: 60 },
    );
    const { result, req } = run(Protected, `Bearer ${token}`);
    await expect(result).resolves.toBe(true);
    expect((req as { user?: unknown }).user).toEqual({
      id: USER_ID,
      kind: 'STAFF',
      companyId: 'c1',
    });
  });

  it('rejects a missing header, a bad token and a wrong scheme with UNAUTHENTICATED', async () => {
    for (const header of [undefined, 'Bearer nonsense', 'Basic abc']) {
      await expect(run(Protected, header).result).rejects.toMatchObject({
        code: 'UNAUTHENTICATED',
      });
    }
  });

  it('rejects a token signed with another secret', async () => {
    const token = await new JwtService({ secret: 'y'.repeat(32) }).signAsync(
      { kind: 'CLIENT' },
      { subject: USER_ID },
    );
    await expect(
      run(Protected, `Bearer ${token}`).result,
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('rejects an expired token with TOKEN_EXPIRED', async () => {
    const token = await jwt.signAsync(
      { kind: 'CLIENT' },
      { subject: USER_ID, expiresIn: -10 },
    );
    await expect(
      run(Protected, `Bearer ${token}`).result,
    ).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
  });

  it('rejects a token with an unknown kind', async () => {
    const token = await jwt.signAsync({ kind: 'ROOT' }, { subject: USER_ID });
    await expect(
      run(Protected, `Bearer ${token}`).result,
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  describe('access token cookie', () => {
    const cookieRun = (
      token: string,
      request: { method?: string; headers?: Record<string, unknown> },
    ) => {
      const { context, req } = fakeContext(
        { handler: Protected.prototype.list, cls: Protected },
        {
          ...request,
          headers: { cookie: `access_token=${token}`, ...request.headers },
        },
      );
      return { result: guard.canActivate(context), req };
    };
    const signed = () =>
      jwt.signAsync({ kind: 'CLIENT' }, { subject: USER_ID, expiresIn: 60 });

    it('authenticates a GET from the cookie', async () => {
      const { result, req } = cookieRun(await signed(), { method: 'GET' });
      await expect(result).resolves.toBe(true);
      expect((req as { user?: { id: string } }).user?.id).toBe(USER_ID);
    });

    it('lets a cookie POST through only from the frontend origin', async () => {
      const token = await signed();
      await expect(
        cookieRun(token, { method: 'POST', headers: { origin: ORIGIN } })
          .result,
      ).resolves.toBe(true);
      for (const origin of [undefined, 'https://evil.test', 'null']) {
        await expect(
          cookieRun(token, { method: 'POST', headers: { origin } }).result,
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      }
    });

    it('does not check the origin for the bearer header', async () => {
      const { result } = run(Protected, `Bearer ${await signed()}`);
      await expect(result).resolves.toBe(true);
    });

    it('prefers the header, and does not fall back to the cookie when it is wrong', async () => {
      const { context } = fakeContext(
        { handler: Protected.prototype.list, cls: Protected },
        {
          method: 'GET',
          headers: {
            authorization: 'Basic abc',
            cookie: `access_token=${await signed()}`,
          },
        },
      );
      await expect(guard.canActivate(context)).rejects.toMatchObject({
        code: 'UNAUTHENTICATED',
      });
    });
  });
});
