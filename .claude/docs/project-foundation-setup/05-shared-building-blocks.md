# Foundation 5 — Shared building blocks

Part of the [project foundation setup](README.md). The reusable pieces every feature module builds on: money arithmetic, pagination, the outbox, idempotent requests, Swagger surfaces, and the architecture rules. All of it lives outside `modules/`, knows nothing about business concepts, and is tested.

## 1. Money (`src/common/utils/money`)

Money is an integer number of **paise**, rates are integer **basis points** (18% = 1800). All rounding goes through one file, so totals are reproducible.

| Function | Use |
| --- | --- |
| `roundHalfUp(n, d)` | `n / d` to the nearest integer, halves up (2.5 → 3). Integer arithmetic, no float drift |
| `applyBps(amount, bps)` | A rate on an amount: `applyBps(25000, 1800)` = 4500. Use it for every discount, tax and commission line |
| `splitProportionally(total, weights)` | Shares a total across weights so the parts **sum exactly** (largest remainder, earlier weight wins ties). Used to share a partly refunded booking across ticket, food and tax |
| `formatInr(paise)` | Display only (`₹10,00,000.00`). Never parse it back |

The tests include 1000 pseudo-random splits that check the sum is exact and every part is within one paisa of its exact share.

## 2. Pagination (`src/common/utils/pagination`)

Keyset (cursor) pagination only, never `OFFSET`. Every paginated endpoint returns `buildPage(...)`, so its `data` is always `{ "items": [...], "page": { "nextCursor": "…", "hasMore": true } }` inside the response envelope.

```ts
// controller: take the query DTO (extend PaginationQueryDto to add filters)
list(@Query() query: PaginationQueryDto) { return this.queries.list(companyId, query); }

// query class
const cursor = query.decodedCursor();
const rows = await prisma.booking.findMany({
  where: { AND: [{ customerId }, keysetWhere('createdAt', cursor, 'desc', (v) => new Date(v))] },
  orderBy: keysetOrderBy('createdAt', 'desc'),
  take: pageQueryLimit(query.limit),            // limit + 1: the extra row says "more exists"
});
return buildPage(rows, query.limit, (row) => ({ sortKey: dateSortKey(row.createdAt), id: row.id }));
```

`limit` defaults to 20, max 100 (422 outside 1–100). The cursor is base64url of the last row's sort value and id; a malformed one gives `422 VALIDATION_FAILED`. The sort is fixed per endpoint, with `id` as the tie-breaker.

## 3. Outbox (`src/infra/outbox`)

A state change that needs follow-up work (email, confirmation after payment, refund) writes an event **in the same transaction**, so a committed change always has its follow-up recorded and a rolled-back one never does.

```ts
await prisma.$transaction(async (tx) => {
  await tx.payment.update(/* ... */);
  await this.outbox.add(tx, { type: 'payment.succeeded', aggregateId: payment.id, data: {} });
});
```

| Piece | Role |
| --- | --- |
| `OutboxService.add(tx, event)` | Inserts into `outbox_events`; stores the request's correlation id with it |
| `OutboxHandlerRegistry` | Modules register handlers (`types: ['payment.succeeded']` or `['booking.*']`) |
| `OutboxDispatcher` | **Worker process only**, polls every second. Claims due rows with `FOR UPDATE SKIP LOCKED`, calls the handlers, marks `processed_at`. A failure counts an attempt and retries with backoff (2, 4, 8 … up to 300 s). An event with no handler stays pending and retries, it is never dropped |
| `WorkerModule` | Root of the worker process: `CoreModule` + outbox + (later) queue processors |

Delivery is **at least once**, so handlers must be idempotent (use the message `id` as a dedupe key). This is a skeleton: once the BullMQ queues exist, each handler enqueues a job (with a deterministic `jobId`) instead of doing the work itself.

Tests (`test/db/outbox.e2e-spec.ts`, real Postgres): a rolled-back transaction leaves no event; delivery with data and correlation id; no double delivery; failure keeps the event and delays the retry; a due retry succeeds; unhandled events are kept; two dispatchers at once deliver each of 30 events exactly once.

## 4. Idempotent requests (`src/common/idempotency`)

Put `@Idempotent()` on a POST that must be safe to retry (create booking, buy membership, record settlement). The client sends `Idempotency-Key: <uuid>`.

| Situation | Result |
| --- | --- |
| First call | Claims the key, runs the handler, stores the response |
| Same key, same request | The stored response is replayed (header `Idempotent-Replayed: true`); the handler does not run |
| Same key, different request | `422 IDEMPOTENCY_KEY_REUSED` |
| Same key while the first call is running | `409 IDEMPOTENCY_KEY_IN_PROGRESS` |
| The first call failed | The claim is released, so a retry runs the handler again |
| Header missing | `422 VALIDATION_FAILED` |

The claim is the primary key `(key, user_id)` of `idempotency_keys`, so concurrent duplicates cannot both run (tested with 10 parallel requests: the handler runs exactly once; the rest get 409 or the replayed response). Keys are per user and expire after 24 hours. The interceptor is registered globally and does nothing on routes without `@Idempotent()`.

Request identity is a hash of method, URL and body, so a retry must send the same body.

## 5. Swagger surfaces (`src/common/swagger`)

One decorator per API surface, put on each controller: `@PublicApi()`, `@AuthApi()`, `@ClientApi()`, `@AdminApi()`, `@PlatformApi()`, `@WebhookApi()`. Each sets the Swagger tag, the auth requirement shown in `/docs`, and the runtime access rule together (for example `@AdminApi()` = tag `admin` + bearer + the `X-Company-Id` key + `@StaffOnly()`), so the docs cannot disagree with the guards. `/docs` and `/docs-json` show the six tags and the `bearer` and `company` security schemes.

## 6. Architecture rules (`test/architecture`)

Checked on every `pnpm test` over all of `src/`:

1. **Controller surface.** `modules/<m>/controllers/<surface>-x.controller.ts` must have `@Controller('<surface>/…')` (an optional `v1/` is allowed) and the matching `@…Api()` decorator.
2. **Module public API.** A module imports another module only through `modules/<other>/index.js`, never its services, repositories or DTOs.
3. **Infrastructure stays below.** Code outside `modules/` (common, prisma, redis…) never imports from `modules/`.

These are tests, not lint rules, because oxlint cannot express path-aware rules like these. The rules themselves are tested with example files that violate them, so a passing run means something. No module exists yet, so the check passes vacuously until the first module is added.

## Not done in this step

- Layer direction between modules (a module may only import lower layers): not checked yet, add it when there are enough modules to make it useful.
- The BullMQ queues themselves, and the daily housekeeping job that purges expired idempotency keys.
