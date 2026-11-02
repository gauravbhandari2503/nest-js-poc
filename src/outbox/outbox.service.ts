import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { Prisma } from '../generated/prisma/client.js';
import type { OutboxEventInput } from './outbox.types.js';

/**
 * Writes an event to `outbox_events` **inside the caller's transaction**, so a committed
 * state change always has its follow-up work recorded, and a rolled-back one never does.
 *
 *   await prisma.$transaction(async (tx) => {
 *     await tx.payment.update(...);
 *     await this.outbox.add(tx, { type: 'payment.succeeded', aggregateId: payment.id, data: {} });
 *   });
 *
 * The worker's dispatcher delivers it later (at least once).
 */
@Injectable()
export class OutboxService {
  constructor(private readonly cls: ClsService) {}

  async add(
    tx: Prisma.TransactionClient,
    event: OutboxEventInput,
  ): Promise<void> {
    await tx.outboxEvent.create({
      data: {
        type: event.type,
        aggregateId: event.aggregateId,
        // The correlation id travels with the event so one search follows a booking
        // from the HTTP request through the worker.
        payload: {
          meta: { correlationId: this.cls.getId() ?? null },
          data: event.data,
        } as Prisma.InputJsonValue,
      },
    });
  }
}
