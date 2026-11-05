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
| Tenant | Staff never pass a company id; it comes from the token. The super admin can call any `/v1/admin/*` route by sending `X-Company-Id: <company uuid>` (see 4.4); under `/platform` they pass `companyId` in the path where relevant |
| Idempotency | `POST /client/bookings`, `POST /client/memberships`, `POST /admin/settlements` require an `Idempotency-Key` header; replays return the original response |
| Correlation | Accept `x-correlation-id`, always return it |
| Responses | DTO classes only — never raw Prisma rows (avoids leaking columns such as `passwordHash`) |

## 2. Envelopes

### Every response: one envelope (`ApiResponseDto`)

Success and error responses share the same fields. `ResponseEnvelopeInterceptor` wraps every success; `ProblemDetailsFilter` builds every error. A `204` has no body.

```json
{
  "isSuccess": true,
  "statusCode": 200,
  "message": "OK",
  "description": null,
  "data": { "id": "0194…", "status": "PENDING" },
  "errors": null,
  "code": null,
  "correlationId": "7c1d…"
}
```

- `data` is the endpoint's response DTO (null on errors). `code` is null on success.
- Clients switch on `code` and `isSuccess`, never on `message`.

### Collections: keyset (cursor) pagination, always

```http
GET /v1/client/bookings?limit=20&cursor=eyJjIjoiMjAyNi0xMS0wMlQxNDowMDowMFoiLCJpIjoiMDE5NC4uLiJ9
```

```json
{
  "isSuccess": true,
  "statusCode": 200,
  "message": "OK",
  "description": null,
  "data": {
    "items": [ { "id": "0194…" } ],
    "page": { "nextCursor": "eyJ…", "hasMore": true }
  },
  "errors": null,
  "code": null,
  "correlationId": "7c1d…"
}
```

- `limit` default 20, max 100. The cursor is opaque (base64 of the last `(sortKey, id)`); never exposes offsets.
- Sort is fixed per endpoint, with `id` as tie-breaker. Filters are explicit query params (`status`, `cityId`, `from`, `to`), validated by DTO. No `OFFSET` anywhere.

### Errors: same envelope, `isSuccess: false`

```json
{
  "isSuccess": false,
  "statusCode": 409,
  "message": "Seat unavailable",
  "description": "Seats A5, A6 were taken by another customer.",
  "data": null,
  "errors": { "seatIds": ["0194…", "0194…"] },
  "code": "SEAT_UNAVAILABLE",
  "correlationId": "7c1d…"
}
```

Validation errors (status 422) put the field list in `errors`: `[{ "field": "seatIds", "message": "must contain at most 10 elements" }]`. Other errors put their extra fields there, or `null`.

The clients switch on `code`, which is stable and documented; `description` is for humans.

### Error catalogue

| `code` | Status | When |
| --- | --- | --- |
| `VALIDATION_FAILED` | 422 | DTO validation |
| `UNAUTHENTICATED` / `TOKEN_EXPIRED` | 401 | Missing, invalid or expired access token |
| `INVALID_CREDENTIALS` | 401 | Wrong email or password (one message for both, so accounts cannot be probed) |
| `LINK_INVALID` | 422 | Emailed token (set/reset password) unknown, used or expired |
| `EMAIL_TAKEN` | 409 | Registration or onboarding with an email that already has an account |
| `COMPANY_SLUG_TAKEN` | 409 | Onboarding a company whose slug already exists |
| `FORBIDDEN` | 403 | Missing permission, or the route is not available to the caller's account type |
| `COMPANY_CONTEXT_REQUIRED` | 400 | Super admin called a company route without a valid `X-Company-Id` |
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
| Access token | JWT, 15 minutes. Claims: `sub`, `kind`, `companyId` (staff only; the super admin has none). Sent as `Authorization: Bearer <JWT>` (the header wins) or as the `access_token` `HttpOnly; Secure; SameSite=Lax` cookie set by login and refresh. A cookie-authenticated `POST`/`PATCH`/`PUT`/`DELETE` is rejected with 403 (CSRF) when it has an `Origin` other than `FRONTEND_ORIGIN`; no `Origin` (Postman, curl, servers) is allowed, since browsers always send it on cross-site writes. The login body still returns the token for non-browser clients |
| Refresh | `POST /v1/auth/refresh` using the `HttpOnly` refresh cookie; rotates on every use |
| Permissions | Not in the token. `GET /v1/auth/me` returns the permission list so the portal can hide menus (the frontend works with permission codes only, never role names); the server still checks every call. **For a super admin the list is every permission code**, because they may do everything on company routes |
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
| POST | `/password/forgot`, `/password/reset` | Reset flow (`forgot` always answers 202) |
| GET | `/me` | The logged-in user, any kind: profile, `employeeId`, `isOwner`, `company` (staff only, else null) and `permissions` (super admin all, customers none). Needs a login, no company header |
| POST | `/password/change` | Logged-in user changes their password (needs the current one); ends their other sessions |
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

**Who can call these routes**

| Caller | Company comes from | Permissions |
| --- | --- | --- |
| Company staff | Their token. An `X-Company-Id` header is ignored | Their role's permissions |
| Super admin | The **`X-Company-Id`** header, required on every call: missing or not a uuid → `400 COMPANY_CONTEXT_REQUIRED`, unknown company → `404 NOT_FOUND`. | All of them; `GET /me` returns every permission code. Theater scope (`staff_theaters`) does not apply |
| Customer | n/a | `403 FORBIDDEN` |

A suspended company can still be acted on by the super admin. Every write by a super admin is audit-logged with the actor and the company they acted on. Money and ledger records stay append-only for everyone.

| Area | Endpoints | Permission |
| --- | --- | --- |
| Me | `GET /me` (profile, company, theaters, permissions) | any staff |
| Company | `PATCH /company` (policies; the company itself comes from `GET /v1/auth/me`); `GET /company/membership-offers`, `PUT /company/membership-offers/{planId}` (opt in/out + price) | any staff (read), `company.manage`, `membership.manage` |
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

The master list lives in one place: [src/common/auth/permissions.ts](../../../src/common/auth/permissions.ts) (`Permission`, `ALL_PERMISSIONS`, `SYSTEM_ROLE_PERMISSIONS`). Controllers, the seed and the portal's `GET /v1/auth/me` all read from it; a unit test (`permissions.spec.ts`) enforces unique codes, owner = everything, other roles ⊆ owner. Adding a permission = add it there, add it to the roles that need it, ship (the seed upserts it).

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
| Companies | `GET/POST /companies` (creates company + owner + sends setup email; see below), `GET/PATCH /companies/{id}` (commission rates, status), `POST /companies/{id}/registration-fee` (see below) |
| Catalog | `/movies`, `/cities` CRUD |
| Membership plans | `/membership-plans` CRUD |
| Tax | `GET /tax-rates`, `POST /tax-rates` (new effective rate; never edits) |
| Requests | `/platform-requests` (list, update, resolve) |
| Money | `GET /companies/{id}/balance`, `GET/POST /settlements` (`Idempotency-Key`), `POST /ledger-adjustments` (memo required) |
| Audit | `GET /audit-logs?companyId=&actorId=&module=&action=&entityType=&entityId=&from=&to=` (newest first, keyset paged; `from`/`to` are ISO 8601, inclusive) |
| Dashboard | `GET /dashboard` (income, companies, bookings, pending payouts) |

**`POST /v1/platform/companies`** (`201`). Body: `name`, optional `slug` (made from `name`), `salesCommissionPercent`, `membershipCommissionPercent` (percent, 0 to 100, up to two decimals, e.g. `12.5`; stored as basis points), `registrationFee` (paise), `cancellationPolicy`, `refundPolicy`, and `owner: { fullName, email, phone?, employeeId? }`. In one transaction it creates the company, the owner (`INVITED`, no password) with the system role `COMPANY_OWNER`, the audit entry and the outbox event `user.set_password_requested`. The worker then issues a 72-hour token and sends the "set your password" email; the owner opens the link and calls `POST /v1/auth/password/setup`. The worker (`pnpm start:worker`) must be running for the email to go out. Response `data`: `{ company, owner: { userId, email, fullName, employeeId, status } }`.

**Company reads and edits.** `GET /v1/platform/companies?status=&q=&limit=&cursor=` lists newest first (`q` matches name or slug); `GET /v1/platform/companies/{id}` adds the owner. `PATCH /v1/platform/companies/{id}` takes any of `salesCommissionPercent`, `membershipCommissionPercent`, `status` (`ACTIVE` or `SUSPENDED`), at least one; it writes nothing and leaves no audit entry when nothing differs. Past bookings keep the rates they were made with. A suspended company's staff cannot log in or refresh (an access token already issued lasts up to 15 minutes). `POST /v1/platform/companies/{id}/registration-fee` (`200`) records the fee paid at the office, once: it sets `registrationFeePaidAt` and adds a `PLATFORM_INCOME` / `REGISTRATION_FEE` ledger entry for the fee amount (none when the fee is 0); a second call is `409 INVALID_STATE_TRANSITION`.

**Resending the owner's invitation.** `POST /v1/platform/companies/{id}/owner/resend-invitation` (`202`) queues a new "set your password" email for an owner who has not set a password yet; the new link retires the old one (issuing a token retires earlier unused tokens of the same purpose). An owner who already has a password gets `409 INVALID_STATE_TRANSITION` and uses "forgot password". Audit action `company.owner_invitation_resent`.

**Admin portal, own company.** The company's details (name, status, policies) come back in `GET /v1/auth/me`, without money terms. `PATCH /v1/admin/company` (`company.manage`) edits `cancellationPolicy` and `refundPolicy` (non-empty, at most 2000 characters; at least one field). The company always comes from the token (a super admin sends `X-Company-Id`).

**Employee ID.** Every staff member, owners included, has an `employeeId`, unique inside their company. A company may give its own (letters, digits and `. _ - /`, at most 40 characters). When none is given the ID is `bmt_<user id>`.

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
