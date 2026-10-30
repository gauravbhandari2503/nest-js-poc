# Book My Ticket — API Design

REST · JSON · OpenAPI generated from code (`@nestjs/swagger` + CLI plugin, served at `/docs` and `/docs-json`) · Status: **draft for review**

The OpenAPI document is **generated from the controllers and DTOs**, not hand-written, so it cannot drift from the code. This file defines the conventions and the endpoint catalogue those controllers must follow. Related: [project-architecture](../project-architecture/project-architecture.md), [system-design](../system-design/system-design.md).

## 1. Conventions

| Topic | Rule |
| --- | --- |
| Base URL | `https://<host>/v1/...` — URI versioning; a breaking change creates `/v2` for that surface and the old one is deprecated for at least 6 months (`Deprecation` and `Sunset` headers) |
| Surfaces | `/v1/public` (no auth), `/v1/auth`, `/v1/client` (customer), `/v1/admin` (company staff), `/v1/platform` (super admin), `/v1/webhooks` (gateway). **Endpoint → controller → service lookup:** [service-and-endpoint-map](../project-architecture/service-and-endpoint-map.md) |
| Resources | Plural nouns, no verbs: `/shows/{id}`. Actions that are not CRUD are sub-resources that create something: `POST /bookings/{id}/cancellation-requests`, `POST /shows/{id}/cancellation` |
| JSON | `camelCase` fields; dates as ISO-8601 UTC strings; money as **integer paise** with a `currency` sibling (`{"amount": 25000, "currency": "INR"}`); rates as integer bps |
| IDs | UUID strings |
| Methods | `GET` read · `POST` create/action · `PATCH` partial update · `PUT` only for full replace of a set (seat prices) · `DELETE` remove/soft-delete |
| Status codes | `200` ok · `201` created (+ `Location`) · `202` accepted (async) · `204` no body · `400` malformed · `401` unauthenticated · `403` authenticated but missing permission · `404` not found **or not yours** · `409` conflict/state · `422` validation · `429` throttled · `5xx` ours |
| Tenant | Staff never pass a company id; it comes from the token. Super admin passes `companyId` where relevant under `/platform` |
| Idempotency | `POST /client/bookings`, `POST /client/memberships`, `POST /admin/settlements` require an `Idempotency-Key` header; replays return the original response |
| Correlation | Accept `x-correlation-id`, always return it |
| Responses | DTO classes only — never raw Prisma rows (avoids leaking columns such as `passwordHash`) |

## 2. Envelopes

### Single resource: the object itself

```json
{ "id": "0194…", "status": "PENDING", "heldUntil": "2026-11-02T14:10:00.000Z" }
```

### Collections: keyset (cursor) pagination, always

```http
GET /v1/client/bookings?limit=20&cursor=eyJjIjoiMjAyNi0xMS0wMlQxNDowMDowMFoiLCJpIjoiMDE5NC4uLiJ9
```

```json
{
  "data": [ { "id": "0194…" } ],
  "page": { "nextCursor": "eyJ…", "hasMore": true }
}
```

- `limit` default 20, max 100. The cursor is opaque (base64 of the last `(sortKey, id)`); never exposes offsets.
- Sort is fixed per endpoint, with `id` as tie-breaker. Filters are explicit query params (`status`, `cityId`, `from`, `to`), validated by DTO. No `OFFSET` anywhere.

### Errors: RFC 7807 `application/problem+json`

```json
{
  "type": "https://api.bookmyticket.test/errors/seat-unavailable",
  "title": "Seat unavailable",
  "status": 409,
  "code": "SEAT_UNAVAILABLE",
  "detail": "Seats A5, A6 were taken by another customer.",
  "instance": "/v1/client/bookings",
  "correlationId": "7c1d…",
  "seatIds": ["0194…", "0194…"]
}
```

Validation errors add `"errors": [{ "field": "seatIds", "message": "must contain at most 10 elements" }]` (status 422).

The clients switch on `code`, which is stable and documented; `detail` is for humans.

### Error catalogue

| `code` | Status | When |
| --- | --- | --- |
| `VALIDATION_FAILED` | 422 | DTO validation |
| `UNAUTHENTICATED` / `TOKEN_EXPIRED` | 401 | Missing, invalid or expired access token |
| `FORBIDDEN` | 403 | Missing permission |
| `NOT_FOUND` | 404 | Missing or outside the caller's tenant |
| `RATE_LIMITED` | 429 | Throttled (`Retry-After` set) |
| `INVALID_STATE_TRANSITION` | 409 | Action not allowed in the current state |
| `SEAT_UNAVAILABLE` | 409 | A seat is held or sold |
| `SEAT_LIMIT_EXCEEDED` | 422 | More than 10 seats |
| `OPEN_CHECKOUT_EXISTS` | 409 | Customer already has a pending booking for this show |
| `BOOKING_EXPIRED` | 409 | Hold ran out |
| `SHOW_NOT_BOOKABLE` | 409 | Show started, cancelled or completed |
| `SHOW_OVERLAP` | 409 | Overlaps another show on the screen |
| `REFUND_NOT_ALLOWED` | 409 | Show already ended / open request exists |
| `REFUND_AMOUNT_EXCEEDS_PAID` | 422 | Approved amount greater than paid minus refunded |
| `TICKET_ALREADY_USED` | 409 | QR scanned twice |
| `TICKET_INVALID` | 422 | Signature check failed or ticket void |
| `MEMBERSHIP_ALREADY_ACTIVE` | 409 | Overlapping membership with the same company |
| `SETTLEMENT_EXCEEDS_BALANCE` | 422 | Payout larger than the payable balance |
| `PAYMENT_PROVIDER_UNAVAILABLE` | 502 | Gateway not reachable |
| `IDEMPOTENCY_KEY_REUSED` | 422 | Same key, different request body |
| `INTERNAL` | 500 | Anything else; see log by `correlationId` |

## 3. Authentication

| | |
| --- | --- |
| Access token | `Authorization: Bearer <JWT>`, 15 minutes. Claims: `sub`, `kind`, `companyId` (staff) |
| Refresh | `POST /v1/auth/refresh` using the `HttpOnly` refresh cookie; rotates on every use |
| Permissions | Not in the token. `GET /v1/admin/me` returns the permission list so the portal can hide menus; the server still checks every call |
| Throttling | Global default; `/auth/*` and `POST /client/bookings` stricter; per-IP and per-account |

## 4. Endpoint catalogue

`P:` = required permission. Super admin passes platform routes by kind; client routes need `kind = CLIENT`. All collection `GET`s are paginated.

### 4.1 Auth (`/v1/auth`)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/register` | Client sign-up (email, password) |
| POST | `/login` | Email + password → access token, refresh cookie |
| POST | `/refresh` | Rotate refresh token |
| POST | `/logout` | Revoke the session family |
| POST | `/password/setup` | Set password with emailed token (new owner, invited staff) |
| POST | `/password/forgot`, `/password/reset` | Reset flow |
| POST | `/invitations/{token}/accept` | Staff accepts an invitation |

### 4.2 Public (`/v1/public`, no auth)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/cities` | Only cities that have an active theater |
| GET | `/movies?cityId=&q=` | Movies with shows in the city |
| GET | `/movies/{id}` | Details |
| GET | `/shows?cityId=&movieId=&date=` | Shows grouped by theater |
| GET | `/shows/{id}` | Show, prices by category, company policy |
| GET | `/shows/{id}/seats` | Seat map with `AVAILABLE`/`HELD`/`SOLD` |
| GET | `/shows/{id}/food` | Food menu |
| GET | `/companies/{id}/membership-offers` | Plans a company sells |

### 4.3 Client (`/v1/client`, customer)

| Method | Path | Purpose |
| --- | --- | --- |
| GET / PATCH | `/me` | Profile |
| POST | `/bookings` | Create booking: hold seats + food, returns payment details, `heldUntil`. `Idempotency-Key` required |
| GET | `/bookings`, `/bookings/{id}` | My orders |
| POST | `/bookings/{id}/cancellation` | Abandon a pending booking and release the hold |
| GET | `/bookings/{id}/ticket` | Ticket with QR payload |
| GET | `/bookings/{id}/ticket/download` | PDF/PNG |
| GET | `/bookings/{id}/invoice` | Invoice (mocked) |
| GET | `/payments` | Payment history |
| POST | `/bookings/{id}/refund-requests` | Ask for cancellation + refund |
| GET | `/refund-requests` | My requests |
| POST | `/memberships` | Buy a membership (`offerId`), returns payment details. `Idempotency-Key` required |
| GET | `/memberships` | My memberships |
| POST | `/support-tickets` · GET `/support-tickets`, `/{id}` · POST `/{id}/messages` | Help tickets |

### 4.4 Admin (`/v1/admin`, company staff; tenant from token)

| Area | Endpoints | Permission |
| --- | --- | --- |
| Me | `GET /me` (profile, company, theaters, permissions) | any staff |
| Company | `GET /company`, `PATCH /company` (policies); `GET /company/membership-offers`, `PUT /company/membership-offers/{planId}` (opt in/out + price) | any staff (read), `company.manage`, `membership.manage` |
| Theaters | `GET/POST /theaters`, `GET/PATCH/DELETE /theaters/{id}` | `theater.read` (reads), `theater.manage` |
| Screens & seats | `/theaters/{id}/screens`, `/screens/{id}`, `PUT /screens/{id}/seats` (layout), `/seat-categories` | `screen.read` (reads), `screen.manage` |
| Shows | `GET/POST /shows`, `GET/PATCH /shows/{id}`, `PUT /shows/{id}/prices`, `POST /shows/{id}/cancellation` | `show.read` (reads), `show.manage`, `show.cancel` |
| Food | `/food-items` CRUD | `food.read` (reads), `food.manage` |
| Staff | `GET /staff`, `GET/POST /staff-invitations`, `PATCH /staff/{id}` (role, theaters), `DELETE /staff/{id}` | `staff.read` (reads), `staff.manage` |
| Bookings | `GET /bookings`, `GET /bookings/{id}` | `booking.read` |
| Tickets | `POST /tickets/verify` (QR + `employeeId`) | `ticket.verify` |
| Refund requests | `GET /refund-requests`, `POST /refund-requests/{id}/approval` (`amount`), `POST /refund-requests/{id}/rejection` | `refund.review` |
| Support | `GET/POST /support-tickets`, `PATCH /support-tickets/{id}`, `POST /…/messages` | `support.handle`; creating a platform request needs `platform_request.create` |
| Workers | `GET /workers`, `POST /workers` (assign by `employeeId`), `POST /workers/{id}/release` | `worker.manage` |
| Reports | `GET /reports/sales?from=&to=&theaterId=` | `report.read` |
| Read-only for scheduling | `GET /movies` (global catalog), `GET /cities` | any staff |

Maintenance staff see only their assigned theaters in every list.

### 4.5 Permission matrix

The master list lives in one place: [src/common/auth/permissions.ts](../../../src/common/auth/permissions.ts) (`Permission`, `ALL_PERMISSIONS`, `SYSTEM_ROLE_PERMISSIONS`). Controllers, the seed and the portal's `GET /v1/admin/me` all read from it; a unit test (`permissions.spec.ts`) enforces unique codes, owner = everything, other roles ⊆ owner. Adding a permission = add it there, add it to the roles that need it, ship (the seed upserts it).

| Code | Owner | Maintenance | Grants |
| --- | :-: | :-: | --- |
| `company.manage` | ✓ | | Edit the company's cancellation/refund policy |
| `membership.manage` | ✓ | | Opt in/out of plans, set price |
| `theater.read` | ✓ | ✓ | View theaters |
| `theater.manage` | ✓ | | Create/edit/delete theaters |
| `screen.read` | ✓ | ✓ | View screens, seats, categories |
| `screen.manage` | ✓ | | Edit screens, seat layouts, categories |
| `show.read` | ✓ | ✓ | View shows |
| `show.manage` | ✓ | | Create/edit shows and prices |
| `show.cancel` | ✓ | | Cancel a show (triggers full refunds) |
| `food.read` | ✓ | ✓ | View food items |
| `food.manage` | ✓ | | Edit food items |
| `staff.read` | ✓ | | View staff and invitations |
| `staff.manage` | ✓ | | Invite staff, change role/theaters, deactivate |
| `booking.read` | ✓ | ✓ | View bookings |
| `ticket.verify` | ✓ | ✓ | Verify/scan a ticket (records the gate employee ID) |
| `refund.review` | ✓ | ✓ | Approve (with amount) or reject refund requests |
| `support.handle` | ✓ | ✓ | Work help and maintenance tickets |
| `platform_request.create` | ✓ | | Raise a request to the super admin |
| `worker.manage` | ✓ | ✓ | Assign/release gate and maintenance workers by employee ID |
| `report.read` | ✓ | | Company sales report |

Theater scope is separate from permissions: maintenance staff only act on theaters in `staff_theaters`, in every list and action. The client app and the super admin do not use this table.

### 4.6 Platform (`/v1/platform`, super admin)

| Area | Endpoints |
| --- | --- |
| Companies | `GET/POST /companies` (creates company + owner + sends setup email), `GET/PATCH /companies/{id}` (commission rates, status), `POST /companies/{id}/registration-fee` |
| Catalog | `/movies`, `/cities` CRUD |
| Membership plans | `/membership-plans` CRUD |
| Tax | `GET /tax-rates`, `POST /tax-rates` (new effective rate; never edits) |
| Requests | `/platform-requests` (list, update, resolve) |
| Money | `GET /companies/{id}/balance`, `GET/POST /settlements` (`Idempotency-Key`), `POST /ledger-adjustments` (memo required) |
| Audit | `GET /audit-logs?module=&companyId=&entityType=&from=&to=` |
| Dashboard | `GET /dashboard` (income, companies, bookings, pending payouts) |

### 4.7 Webhooks (`/v1/webhooks`)

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/payments/{provider}` | Raw body, signature header verified first, always `200` after durable write, no auth guard, excluded from throttling |

## 5. Worked example: booking

**Request**

```http
POST /v1/client/bookings
Authorization: Bearer …
Idempotency-Key: 5b1c…
Content-Type: application/json

{
  "showId": "0194…",
  "seatIds": ["0194…a", "0194…b"],
  "food": [{ "foodItemId": "0194…f", "quantity": 2, "slot": "PRE_INTERVAL" }]
}
```

**201 Created**

```json
{
  "id": "0194…",
  "reference": "BMT-7K3Q9X",
  "status": "PENDING",
  "heldUntil": "2026-11-02T14:10:00.000Z",
  "pricing": {
    "currency": "INR",
    "seatsSubtotal": 50000,
    "discount": { "bps": 1000, "amount": 5000 },
    "foodSubtotal": 24000,
    "tax": 9000,
    "total": 78000
  },
  "payment": { "provider": "razorpay", "orderId": "order_Nx…", "amount": 78000 }
}
```

Errors: `409 SEAT_UNAVAILABLE`, `422 SEAT_LIMIT_EXCEEDED`, `409 OPEN_CHECKOUT_EXISTS`, `409 SHOW_NOT_BOOKABLE`, `502 PAYMENT_PROVIDER_UNAVAILABLE`.

The client then pays at the gateway and polls `GET /v1/client/bookings/{id}` until `status = CONFIRMED` (or `EXPIRED`); confirmation arrives asynchronously through the webhook (system-design 4.1).

## 6. Evolution and compatibility

- Adding fields, endpoints or enum **output** values is non-breaking; clients must ignore unknown fields.
- Removing/renaming fields, changing types or semantics, or tightening validation is breaking → new version.
- Every endpoint is tagged by surface in Swagger (`@ApiTags('client: bookings')`), so `/docs` doubles as per-surface reference.
- Contract check in CI: export `/docs-json`, lint with `npx @redocly/cli lint`, and diff against the previous version to flag breaking changes (added once the first surface is stable).
