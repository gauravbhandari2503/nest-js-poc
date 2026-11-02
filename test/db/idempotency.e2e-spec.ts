import { HttpCode } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import {
  Idempotent,
  IdempotencyInterceptor,
} from '../../src/common/idempotency/idempotency.interceptor.js';
import { createTestPrisma, createUser, uid } from './helpers.js';

class Controller {
  @Idempotent()
  create() {}

  @Idempotent()
  @HttpCode(200)
  settle() {}

  plain() {}
}

describe('IdempotencyInterceptor', () => {
  let prisma: PrismaClient;
  let interceptor: IdempotencyInterceptor;
  let user: { id: string };

  beforeAll(async () => {
    prisma = createTestPrisma();
    interceptor = new IdempotencyInterceptor(new Reflector(), prisma as never);
    user = await createUser(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const call = (options: {
    key?: string;
    body?: unknown;
    userId?: string;
    handler?: () => void;
    run?: () => Promise<unknown>;
  }) => {
    const headers: Record<string, string> = options.key
      ? { 'idempotency-key': options.key }
      : {};
    const response = { statusCode: 200, status: vi.fn(), setHeader: vi.fn() };
    const context = {
      getHandler: () => options.handler ?? Controller.prototype.create,
      getClass: () => Controller,
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          originalUrl: '/v1/client/bookings',
          body: options.body ?? { seats: ['A1'] },
          headers,
          user: { id: options.userId ?? user.id, kind: 'CLIENT' },
        }),
        getResponse: () => response,
      }),
    };
    const handle = vi.fn(() =>
      options.run ? from$(options.run) : of({ id: 'booking-1' }),
    );
    const result = interceptor.intercept(context as never, { handle });
    return { result: lastValueFrom(result), handle, response };
  };
  const from$ = (run: () => Promise<unknown>) =>
    new (class {
      subscribe(observer: {
        next: (v: unknown) => void;
        error: (e: unknown) => void;
      }) {
        run().then(observer.next, observer.error);
        return { unsubscribe() {} };
      }
    })() as never;

  const newKey = () => `key-${uid()}-${uid()}`;

  it('does not touch routes that are not marked @Idempotent', async () => {
    const { result, handle } = call({ handler: Controller.prototype.plain });
    await expect(result).resolves.toEqual({ id: 'booking-1' });
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it('requires the Idempotency-Key header (422)', async () => {
    await expect(call({}).result).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      status: 422,
    });
    await expect(call({ key: 'short' }).result).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('runs the handler once and replays the stored response on a retry', async () => {
    const key = newKey();
    const first = call({ key });
    expect(await first.result).toEqual({ id: 'booking-1' });
    expect(first.handle).toHaveBeenCalledTimes(1);

    const retry = call({ key });
    expect(await retry.result).toEqual({ id: 'booking-1' });
    expect(retry.handle).not.toHaveBeenCalled();
    expect(retry.response.status).toHaveBeenCalledWith(201);
    expect(retry.response.setHeader).toHaveBeenCalledWith(
      'Idempotent-Replayed',
      'true',
    );
  });

  it('stores the status from @HttpCode, not the pre-interceptor default', async () => {
    const key = newKey();
    await call({ key, handler: Controller.prototype.settle }).result;
    const retry = call({ key, handler: Controller.prototype.settle });
    await retry.result;
    expect(retry.response.status).toHaveBeenCalledWith(200);
  });

  it('rejects the same key with a different body (422 IDEMPOTENCY_KEY_REUSED)', async () => {
    const key = newKey();
    await call({ key, body: { seats: ['A1'] } }).result;

    const other = call({ key, body: { seats: ['A2'] } });
    await expect(other.result).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
      status: 422,
    });
    expect(other.handle).not.toHaveBeenCalled();
  });

  it('answers 409 while the first call is still running', async () => {
    const key = newKey();
    let release!: () => void;
    const slow = call({
      key,
      run: () =>
        new Promise((resolve) => (release = () => resolve({ id: 'slow' }))),
    });
    await vi.waitFor(async () => {
      expect(await prisma.idempotencyKey.count({ where: { key } })).toBe(1);
    });

    await expect(call({ key }).result).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_IN_PROGRESS',
      status: 409,
    });

    release();
    expect(await slow.result).toEqual({ id: 'slow' });
  });

  it('runs the handler once however many concurrent requests share a key', async () => {
    const key = newKey();
    const calls = Array.from({ length: 10 }, () =>
      call({
        key,
        run: async () => (
          await new Promise((r) => setTimeout(r, 30)),
          { id: 'one' }
        ),
      }),
    );
    const settled = await Promise.allSettled(calls.map((c) => c.result));

    // The handler ran once. Every other request either arrived while it was running (409)
    // or after it finished (the stored response is replayed): never a second execution.
    expect(calls.filter((c) => c.handle.mock.calls.length > 0)).toHaveLength(1);
    for (const result of settled) {
      if (result.status === 'fulfilled')
        expect(result.value).toEqual({ id: 'one' });
      else
        expect(result.reason).toMatchObject({
          code: 'IDEMPOTENCY_KEY_IN_PROGRESS',
        });
    }
    expect(settled.some((r) => r.status === 'fulfilled')).toBe(true);
  });

  it('releases the key when the handler fails, so the client can retry', async () => {
    const key = newKey();
    const failing = call({
      key,
      run: () => Promise.reject(new Error('seat taken')),
    });
    await expect(failing.result).rejects.toThrow('seat taken');
    expect(await prisma.idempotencyKey.count({ where: { key } })).toBe(0);

    const retry = call({ key });
    expect(await retry.result).toEqual({ id: 'booking-1' });
    expect(retry.handle).toHaveBeenCalledTimes(1);
  });

  it('keeps keys separate per user', async () => {
    const key = newKey();
    const other = await createUser(prisma);
    await call({ key }).result;

    const theirs = call({ key, userId: other.id });
    await theirs.result;
    expect(theirs.handle).toHaveBeenCalledTimes(1);
  });

  it('treats an expired key as unused', async () => {
    const key = newKey();
    await call({ key }).result;
    await prisma.idempotencyKey.updateMany({
      where: { key },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const again = call({ key, body: { seats: ['B7'] } });
    await again.result;
    expect(again.handle).toHaveBeenCalledTimes(1);
  });
});
