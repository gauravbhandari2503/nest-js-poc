/** What a service hands to `OutboxService.add`. */
export interface OutboxEventInput {
  /** Dotted name, e.g. `payment.succeeded`, `booking.confirmed`. */
  type: string;
  /** Id of the aggregate the event is about (booking id, payment id...). Stored as text. */
  aggregateId: string;
  /** JSON-serialisable facts. Keep it small: handlers re-read current state from the database. */
  data: Record<string, unknown>;
}

/** What a handler receives. */
export interface OutboxMessage {
  /** The outbox row id: use it as a dedupe key, delivery is at-least-once. */
  id: string;
  type: string;
  aggregateId: string;
  data: Record<string, unknown>;
  correlationId?: string;
  attempts: number;
}

export interface OutboxHandler {
  /** Event types this handler wants. A trailing `*` matches a prefix (`booking.*`). */
  readonly types: readonly string[];
  /** Must be idempotent. Throwing makes the dispatcher retry with backoff. */
  handle(message: OutboxMessage): Promise<void>;
}
