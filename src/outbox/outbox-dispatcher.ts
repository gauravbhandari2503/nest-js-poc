import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxHandlerRegistry } from './outbox-handler.registry.js';
import type { OutboxMessage } from './outbox.types.js';

interface ClaimedRow {
  id: string;
  type: string;
  aggregate_id: string;
  payload: {
    meta?: { correlationId?: string | null };
    data?: Record<string, unknown>;
  };
  attempts: number;
}

export const OUTBOX_BATCH_SIZE = 50;
const POLL_INTERVAL_MS = 1000;
const MAX_BACKOFF_SECONDS = 300;

/** Retry delay: 2, 4, 8... seconds, capped at five minutes. */
export const backoffSeconds = (attempts: number): number =>
  Math.min(2 ** Math.max(attempts, 1), MAX_BACKOFF_SECONDS);

/**
 * Runs in the worker process. Every second it claims pending outbox rows, hands each to
 * the registered handlers, and marks it processed. Delivery is at least once: a crash
 * after a handler ran but before the row is marked means the handler runs again, so
 * handlers must be idempotent.
 *
 * Skeleton: handlers are registered in-process via `OutboxHandlerRegistry`. When the
 * BullMQ queues exist, the handler for each event type enqueues a job (with a
 * deterministic jobId) instead of doing the work itself.
 */
@Injectable()
export class OutboxDispatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxDispatcher.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: OutboxHandlerRegistry,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), POLL_INTERVAL_MS);
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  /** Never overlaps itself: a slow batch simply delays the next poll. */
  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.dispatchBatch();
    } catch (error) {
      this.logger.error({ err: error }, 'Outbox dispatch failed');
    } finally {
      this.running = false;
    }
  }

  /**
   * Claims up to `limit` due rows with `FOR UPDATE SKIP LOCKED`, so several workers can run
   * side by side without taking the same row, then delivers them in order. Returns how many
   * rows were processed successfully.
   */
  async dispatchBatch(limit = OUTBOX_BATCH_SIZE): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<ClaimedRow[]>`
        SELECT id, type, aggregate_id, payload, attempts
        FROM outbox_events
        WHERE processed_at IS NULL AND available_at <= now()
        ORDER BY available_at, id
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED`;

      let delivered = 0;
      for (const row of rows) {
        try {
          await this.deliver(row);
          await tx.outboxEvent.update({
            where: { id: row.id },
            data: { processedAt: new Date() },
          });
          delivered += 1;
        } catch (error) {
          const attempts = row.attempts + 1;
          this.logger.warn(
            { err: error, eventId: row.id, type: row.type, attempts },
            'Outbox handler failed, will retry',
          );
          await tx.outboxEvent.update({
            where: { id: row.id },
            data: {
              attempts,
              availableAt: new Date(
                Date.now() + backoffSeconds(attempts) * 1000,
              ),
            },
          });
        }
      }
      return delivered;
    });
  }

  private async deliver(row: ClaimedRow) {
    const handlers = this.registry.handlersFor(row.type);
    if (handlers.length === 0) {
      // Not "processed": the event stays and retries, so it is delivered once a handler exists.
      throw new Error(`No handler registered for ${row.type}`);
    }
    const message: OutboxMessage = {
      id: row.id,
      type: row.type,
      aggregateId: row.aggregate_id,
      data: row.payload.data ?? {},
      correlationId: row.payload.meta?.correlationId ?? undefined,
      attempts: row.attempts,
    };
    for (const handler of handlers) await handler.handle(message);
  }
}
