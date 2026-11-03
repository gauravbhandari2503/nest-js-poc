import { HttpCode } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { lastValueFrom, of } from 'rxjs';
import { mock } from 'vitest-mock-extended';
import { ResponseEnvelopeInterceptor } from '../response-envelope.interceptor.js';

class Controller {
  create() {}

  @HttpCode(200)
  login() {}

  @HttpCode(204)
  logout() {}
}

function run(handler: () => void, method: string, body: unknown) {
  const cls = mock<ClsService>();
  cls.getId.mockReturnValue('corr-1');
  const context = {
    getType: () => 'http',
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => ({ method }) }),
  };
  return lastValueFrom(
    new ResponseEnvelopeInterceptor(cls).intercept(context as never, {
      handle: () => of(body),
    }),
  );
}

describe('ResponseEnvelopeInterceptor', () => {
  it('wraps the handler result in the shared envelope', async () => {
    expect(
      await run(Controller.prototype.login, 'POST', { accessToken: 't' }),
    ).toEqual({
      isSuccess: true,
      statusCode: 200,
      message: 'OK',
      description: null,
      data: { accessToken: 't' },
      errors: null,
      code: null,
      correlationId: 'corr-1',
    });
  });

  it('uses the default status of the method when @HttpCode is absent', async () => {
    expect(
      await run(Controller.prototype.create, 'POST', { id: '1' }),
    ).toMatchObject({ statusCode: 201, message: 'Created' });
    expect(await run(Controller.prototype.create, 'GET', [])).toMatchObject({
      statusCode: 200,
      data: [],
    });
  });

  it('sends data: null when the handler returns nothing', async () => {
    expect(
      await run(Controller.prototype.create, 'POST', undefined),
    ).toMatchObject({ data: null });
  });

  it('leaves 204 responses empty', async () => {
    expect(
      await run(Controller.prototype.logout, 'POST', undefined),
    ).toBeUndefined();
  });
});
