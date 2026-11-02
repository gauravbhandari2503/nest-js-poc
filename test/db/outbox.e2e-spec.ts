import type { ClsService } from 'nestjs-cls';
import { mock } from 'vitest-mock-extended';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { OutboxDispatcher } from '../../src/outbox/outbox-dispatcher.js';
import { OutboxHandlerRegistry } from '../../src/outbox/outbox-handler.registry.js';
import { OutboxService } from '../../src/outbox/outbox.service.js';
import type { OutboxMessage } from '../../src/outbox/outbox.types.js';
import { createTestPrisma, uid } from './helpers.js';

// outbox_events is shared and never truncated, so every test uses its own event type
// (`test.<random>.created`) and registers a handler only for that type. Other tests'
// leftover rows have no handler in this registry and are simply retried later.
describe('outbox', () => {
  let prisma: PrismaClient;
  let outbox: OutboxService;

  beforeAll(() => {
    prisma = createTestPrisma();
    const cls = mock<ClsService>();
    cls.getId.mockReturnValue('corr-test');
    outbox = new OutboxService(cls);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const dispatcherWith = (
    type: string,
    handle: (m: OutboxMessage) => Promise<void>,
  ) => {
    const registry = new OutboxHandlerRegistry();
    registry.register({ types: [type], handle });
    // PrismaService extends PrismaClient, so the test client stands in for it.
    return new OutboxDispatcher(prisma as never, registry);
  };

  const rowOf = (type: string) =>
    prisma.outboxEvent.findFirstOrThrow({ where: { type } });

  it('writes the event only when the surrounding transaction commits', async () => {
    const type = `test.${uid()}.rolledback`;

    await expect(
      prisma.$transaction(async (tx) => {
        await outbox.add(tx, { type, aggregateId: 'a1', data: { n: 1 } });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await prisma.outboxEvent.count({ where: { type } })).toBe(0);

    await prisma.$transaction((tx) =>
      outbox.add(tx, { type, aggregateId: 'a1', data: { n: 1 } }),
    );
    expect(await prisma.outboxEvent.count({ where: { type } })).toBe(1);
  });

  it('delivers an event to its handler with data and correlation id, then marks it processed', async () => {
    const type = `test.${uid()}.created`;
    await prisma.$transaction((tx) =>
      outbox.add(tx, { type, aggregateId: 'booking-1', data: { total: 500 } }),
    );
    const received: OutboxMessage[] = [];

    await dispatcherWith(
      type,
      async (m) => void received.push(m),
    ).dispatchBatch();

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      type,
      aggregateId: 'booking-1',
      data: { total: 500 },
      correlationId: 'corr-test',
      attempts: 0,
    });
    expect((await rowOf(type)).processedAt).not.toBeNull();
  });

  it('does not deliver a processed event again', async () => {
    const type = `test.${uid()}.once`;
    await prisma.$transaction((tx) =>
      outbox.add(tx, { type, aggregateId: 'x', data: {} }),
    );
    const handle = vi.fn(async () => {});
    const dispatcher = dispatcherWith(type, handle);

    await dispatcher.dispatchBatch();
    await dispatcher.dispatchBatch();

    expect(handle).toHaveBeenCalledTimes(1);
  });

  it('keeps a failed event, counts the attempt and delays the retry', async () => {
    const type = `test.${uid()}.fails`;
    await prisma.$transaction((tx) =>
      outbox.add(tx, { type, aggregateId: 'x', data: {} }),
    );
    const handle = vi.fn(async () => {
      throw new Error('handler down');
    });
    const dispatcher = dispatcherWith(type, handle);

    expect(await dispatcher.dispatchBatch()).toBe(0);
    const row = await rowOf(type);
    expect(row.processedAt).toBeNull();
    expect(row.attempts).toBe(1);
    expect(row.availableAt.getTime()).toBeGreaterThan(Date.now());

    // Not due yet, so the next poll leaves it alone.
    await dispatcher.dispatchBatch();
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it('retries an event once it is due and then succeeds', async () => {
    const type = `test.${uid()}.flaky`;
    await prisma.$transaction((tx) =>
      outbox.add(tx, { type, aggregateId: 'x', data: {} }),
    );
    let calls = 0;
    const dispatcher = dispatcherWith(type, async () => {
      if (++calls === 1) throw new Error('first try fails');
    });

    await dispatcher.dispatchBatch();
    await prisma.outboxEvent.updateMany({
      where: { type },
      data: { availableAt: new Date(Date.now() - 1000) },
    });
    await dispatcher.dispatchBatch();

    expect(calls).toBe(2);
    expect((await rowOf(type)).processedAt).not.toBeNull();
  });

  it('keeps an event nobody handles yet, instead of dropping it', async () => {
    const type = `test.${uid()}.orphan`;
    await prisma.$transaction((tx) =>
      outbox.add(tx, { type, aggregateId: 'x', data: {} }),
    );

    await dispatcherWith('some.other.type', async () => {}).dispatchBatch();

    const row = await rowOf(type);
    expect(row.processedAt).toBeNull();
  });

  it('two dispatchers running at once never deliver the same event twice (SKIP LOCKED)', async () => {
    const type = `test.${uid()}.parallel`;
    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < 30; i++)
        await outbox.add(tx, { type, aggregateId: `a${i}`, data: {} });
    });
    const seen: string[] = [];
    const handle = async (m: OutboxMessage) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      seen.push(m.id);
    };

    await Promise.all([
      dispatcherWith(type, handle).dispatchBatch(),
      dispatcherWith(type, handle).dispatchBatch(),
    ]);
    await dispatcherWith(type, handle).dispatchBatch(); // sweep up anything the others skipped

    expect(seen).toHaveLength(30);
    expect(new Set(seen).size).toBe(30);
  });

  it('matches prefix patterns', () => {
    const registry = new OutboxHandlerRegistry();
    const handler = {
      types: ['booking.*', 'payment.succeeded'],
      handle: async () => {},
    };
    registry.register(handler);

    expect(registry.handlersFor('booking.confirmed')).toEqual([handler]);
    expect(registry.handlersFor('payment.succeeded')).toEqual([handler]);
    expect(registry.handlersFor('payment.failed')).toEqual([]);
  });
});
