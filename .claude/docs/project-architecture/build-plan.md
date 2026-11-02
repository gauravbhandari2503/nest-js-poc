# Build plan: module by module

The foundation (config, database, seed, errors, tenancy, outbox, money, pagination, CI) is done: see [project foundation setup](../project-foundation-setup/README.md). This page is the order in which the business modules are built. It refines the delivery plan in [project-architecture, section 9](project-architecture.md#9-delivery-plan) and uses the module names from the [service and endpoint map](service-and-endpoint-map.md).

## How every module is built

The same loop each time, so a module is only "done" when all of it is true:

1. **Module folder** with the standard shape (`controllers/<surface>/`, `services/`, `queries/`, `domain/`, `dto/`, `index.ts`), see project-architecture 4.3.
2. **Services** hold the rules and take `companyId` as the first parameter; **controllers** only call them. Every controller carries its surface decorator (`@AdminApi()` etc.).
3. **Errors** are `DomainError`s with codes from the catalogue; add a code if one is missing.
4. **Tests**: unit tests for rules; an e2e test per endpoint group; for every admin endpoint a **cross-tenant test** (company A's token gets 404 for company B's id).
5. **Docs**: endpoint table in api-design stays true; add a short note to the foundation/feature docs if a decision was made.
6. **Exit check** below passes, and `pnpm lint && pnpm format:check && pnpm typecheck && pnpm build && pnpm test && pnpm test:e2e` are green.

Layer order matters: a module may import only modules in lower layers (identity/rbac/companies/catalog/venues first, then shows/pricing/food/memberships, then booking/payments, then the rest).

## The order

| # | Module(s) | What it delivers | Depends on | Exit check |
| --- | --- | --- | --- | --- |
| **1** | **identity + rbac (auth)** | `POST /auth/login`, `/refresh`, `/logout`, `/register` (customer); `JwtAuthGuard` registered globally with the tenant and permission guards switched on; `GET /admin/me` (permission list, all codes for a super admin); password set/forgot/reset by emailed token (Mailpit); Redis cache for permissions (60 s) | foundation | Log in as the **seeded super admin**; staff token reaches `/admin`, customer token does not; permission matrix test; refresh-token reuse revokes the whole family; staff with `X-Company-Id` still sees only their own company |
| **2** | **companies + staff + audit** | Super admin onboards a company (company + owner user + setup email), commission rates, suspend/activate, registration fee; owner invites staff, accepts invitation, changes role/theaters, deactivates; **audit log** writing (actor, company, `actingAs`) | 1 | Onboard → email in Mailpit → owner sets password and logs in; invite → accept → staff can act; every platform and admin write appears in the audit log |
| **3** | **catalog + venues** | Cities and movies (super admin) plus public browse; theaters, screens, seat categories, seat layout (`PUT .../seats`) | 1, 2 | Tenant isolation tests on every venue endpoint; composite FK rejects cross-company data through the API |
| **4** | **pricing + shows** | Tax rate history; the pure price calculator; shows with prices per seat category; the overlap rule surfaced as `SHOW_OVERLAP`; show cancel (state only) | 3 | Overlap rejected by the database and mapped to the error code; back-to-back allowed; calculator property tests (total equals sum of lines, discount never exceeds list) |
| **5a** | **booking: seat map and hold** | Public seat map; create booking (hold seats, one open checkout per customer per show); hold expiry (delayed job + per-minute sweep); the claim in `seat-claim.repository.ts` | 4 | **Race test** through the API: N parallel requests for one seat, exactly one wins; expired hold is re-claimable without the sweeper |
| **5b** | **payments + confirmation + tickets** | Mock gateway, payment webhook inbox (`UNIQUE (provider, event_id)`), confirmation (seats SOLD, ticket with signed QR, invoice), `payment.succeeded` through the **outbox**, first real handlers and BullMQ processors; ticket verify at the gate | 5a | Pay → webhook → ticket issued and email in Mailpit; replayed webhook is a no-op; payment after hold expiry follows the documented rules |
| **6** | **food + memberships** | Food menu and slots; membership plans, company opt-in, purchase, discount applied to seats at checkout | 4, 5b | Snapshot immutability test: later price/rate changes never alter an old booking |
| **7** | **refund-requests + cancellations** | Customer refund request, staff decision, gateway refund, show-cancellation refunds | 5b | State machine tests; refunded never exceeds paid |
| **8** | **ledger + settlements + reports** | Recognition job at show end, payable balances, settlements (locked per company), adjustments, company sales report, super admin dashboard | 5b, 7 | Ledger idempotency; balance reconciles with bookings; no double payout under concurrency |
| **9** | **support** | Help, maintenance and platform-request tickets, routing, worker assignment | 2, 3 | Routing tests per ticket type |
| **10** | **hardening** | k6 load test on one hot show, `EXPLAIN` review of the critical queries, security pass, docs polish | all | Targets in system-design section 1 met |

## Why this order

- **Auth first.** Everything else needs a logged-in user, and the guards we built stay switched off until the JWT guard exists. It also closes the open "log in as the super admin" item.
- **People before data.** Companies and staff (2) must exist before venues (3), because venue data belongs to a company.
- **Shows before booking.** A booking needs a show with prices and a seat layout.
- **Booking is split in two (5a and 5b)** because it is the largest and riskiest slice: first prove seats cannot be double-sold, then add money and tickets on top of that.
- **Food and memberships after the core.** They add discount and food lines to a checkout that already works end to end.
- **Money last.** The ledger needs completed bookings and refunds to exist, so it comes after them.

## First demo points

- After **2**: the super admin onboards a company and its owner logs in.
- After **4**: an owner can build a theater, a screen and a scheduled show.
- After **5b**: a customer can find a show, pick seats, pay (mock) and receive a ticket. This is the milestone that proves the product.

## Open decisions to confirm before they are needed

| When | Decision |
| --- | --- |
| 1 | Customer registration: email verification now, or later? (the design assumes email/password only, no verification) |
| 2 | Platform admin changing the seeded password: a change-password endpoint in milestone 1, since the seed never resets an existing admin's password |
| 5b | Payment provider for later: Stripe or Razorpay (the mock gateway is enough until then) |
