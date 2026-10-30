# Service and Endpoint Map

The lookup page: **which endpoint is handled by which controller, which calls which service, and who is allowed**. Use it when you know a URL and want the code, or know a service and want to know who calls it.

Context: [project-architecture](project-architecture.md) (layout and rules) · [api-design](../api-design/api-design.md) (request/response conventions, errors) · permissions: [api-design 4.5](../api-design/api-design.md#45-permission-matrix).

Status: **draft for review**. Names are the planned class names; the code does not exist yet.

## 1. The six surfaces

An endpoint belongs to exactly one surface, shown in its URL prefix, its controller folder, its controller class prefix and its Swagger tag. That is the whole naming system.

| Surface | URL prefix | Caller | Authentication | Controller folder | Class prefix | Swagger tag |
| --- | --- | --- | --- | --- | --- | --- |
| Public | `/v1/public` | Anyone, browsing | None | `controllers/public/` | `Public…Controller` | `public: <resource>` |
| Auth | `/v1/auth` | Everyone, logging in | None / refresh cookie | `controllers/auth/` | `Auth…Controller` | `auth` |
| **Client** | `/v1/client` | Customer (client app) | JWT, `kind = CLIENT` | `controllers/client/` | `Client…Controller` | `client: <resource>` |
| **Admin** | `/v1/admin` | Company owner / maintenance staff (admin portal) | JWT, `kind = STAFF` + permission | `controllers/admin/` | `Admin…Controller` | `admin: <resource>` |
| Platform | `/v1/platform` | Super admin (admin portal) | JWT, `kind = SUPER_ADMIN` | `controllers/platform/` | `Platform…Controller` | `platform: <resource>` |
| Webhooks | `/v1/webhooks` | Payment gateway | Signature | `controllers/webhooks/` | `…WebhookController` | `webhooks` |

Example: `POST /v1/client/bookings` → `modules/booking/controllers/client/client-bookings.controller.ts` → `ClientBookingsController` → tag `client: bookings`.

Rules that make this reliable:

1. A controller file lives in the folder of its surface and its route prefix matches that folder. A lint check (path vs `@Controller` prefix) enforces it.
2. A controller never serves two surfaces. If the admin portal and client app both need "show details", there are two controllers, because the response shape and the scoping differ.
3. Surface-level guards are applied once per controller (`@ClientOnly()`, `@StaffOnly()`, `@PlatformOnly()`); permissions per route.

## 2. Service taxonomy

Five kinds of class, each recognisable by its name and folder. When looking for "the service that does X", the kind tells you which folder.

| Kind | Name pattern | Folder | Does | Changes data? | Who calls it |
| --- | --- | --- | --- | :-: | --- |
| **Command service** | `…Service` | `services/` | One business operation (use case), in a transaction, with audit and outbox | Yes | Controllers of any surface, processors |
| **Query service** | `Client…Queries`, `Admin…Queries`, `Public…Queries`, `Platform…Queries` | `queries/` | Reads, filters, paginates, maps to response DTOs, applies the audience's scope | No | Controllers of **that** surface only |
| **Domain** | `…Calculator`, `…-state.ts`, pure functions | `domain/` | Business rules with no I/O | No | Services |
| **Gateway / adapter** | `…Gateway`, `MailService`, `QrSigner` | `services/` or technical module | Talks to the outside world behind an interface | n/a | Services, processors |
| **Processor** | `…Processor` | `processors/` | Consumes a BullMQ job or cron tick and delegates to a service | via service | The worker process only |

Scope rules for query services (this is what prevents data leaks):

| Query class prefix | Always filtered by |
| --- | --- |
| `Public…Queries` | Nothing private; only active theaters of active companies, scheduled shows |
| `Client…Queries` | `customer_id` = the caller |
| `Admin…Queries` | `company_id` from the token; plus the caller's theaters when the role is theater-scoped |
| `Platform…Queries` | Nothing (super admin sees all) or an explicit `companyId` parameter |

Command services receive the actor explicitly (`create(actor, dto)`), never read the request. Ownership checks (the row belongs to the caller's company/customer) live in the service, with `404` on mismatch.

## 3. Service catalogue by module

`Called by` uses: **C** client · **A** admin · **P** platform · **Pub** public · **W** worker (processor/cron) · **int** other modules only.

### identity

| Class | Kind | Responsibility | Called by |
| --- | --- | --- | --- |
| `AuthService` | Command | Register client, login, refresh, logout | Pub-auth |
| `PasswordService` | Command | Set password from emailed token, forgot, reset | Pub-auth |
| `TokenService` | Command (internal) | Issue/verify JWTs, rotate refresh tokens, detect reuse | `AuthService` |
| `ClientProfileService` | Command | Update own profile | C |
| `ClientProfileQueries` | Query | Own profile | C |

### rbac

| Class | Kind | Responsibility | Called by |
| --- | --- | --- | --- |
| `PermissionService` | Command (internal) | Load and cache (Redis, 60 s) a user's permissions and theater scope; used by guards | Guards |
| `StaffInvitationService` | Command | Create invitation + email token, accept invitation | A, Pub-auth |
| `StaffService` | Command | Change role/theaters, deactivate | A |
| `AdminStaffQueries` | Query | List staff and invitations | A |
| `AdminMeQueries` | Query | Profile, company, theaters, permission list for the portal | A |

### companies

| Class | Kind | Responsibility | Called by |
| --- | --- | --- | --- |
| `CompanyOnboardingService` | Command | Create company + owner, registration fee, setup email | P |
| `CompanyRatesService` | Command | Commission rates, suspend/activate | P |
| `CompanyPolicyService` | Command | Cancellation and refund policy | A |
| `PlatformCompanyQueries` | Query | List/detail companies | P |
| `AdminCompanyQueries` | Query | Own company | A |

### catalog

| Class | Kind | Responsibility | Called by |
| --- | --- | --- | --- |
| `MovieService` | Command | Movie CRUD (global catalog) | P |
| `CityService` | Command | City CRUD | P |
| `PublicCatalogQueries` | Query | Cities with theaters, movies by city, movie detail | Pub |
| `PlatformCatalogQueries` | Query | Full catalog incl. inactive | P |
| `AdminCatalogQueries` | Query | Read-only catalog for scheduling shows | A |

### venues

| Class | Kind | Responsibility | Called by |
| --- | --- | --- | --- |
| `TheaterService` | Command | Theater CRUD | A |
| `ScreenService` | Command | Screen CRUD | A |
| `SeatLayoutService` | Command | Replace a screen's seat layout (`PUT …/seats`) | A |
| `SeatCategoryService` | Command | Seat category CRUD | A |
| `AdminVenueQueries` | Query | Theaters, screens, layouts, categories (company + theater scoped) | A |

### shows

| Class | Kind | Responsibility | Called by |
| --- | --- | --- | --- |
| `ShowService` | Command | Create/update show, set prices; maps the overlap constraint to `SHOW_OVERLAP` | A |
| `ShowCancellationService` | Command | Cancel a show, queue refunds | A |
| `ShowCompletionService` | Command | Mark ended shows and bookings completed | W |
| `AdminShowQueries` | Query | Show list/detail for the company | A |
| `PublicShowQueries` | Query | Shows by city/movie/date, show detail, **seat map** | Pub |

### pricing

| Class | Kind | Responsibility | Called by |
| --- | --- | --- | --- |
| `TaxRateService` | Command | Add a tax rate (new effective row) | P |
| `PricingService` | Command (internal) | Load current rates/prices, call the calculator, return the snapshot | `booking`, `memberships` |
| `PricingCalculator` | Domain | Pure price/discount/tax calculation | `PricingService` |
| `PlatformTaxQueries` | Query | Tax rate history | P |

### food

| Class | Kind | Responsibility | Called by |
| --- | --- | --- | --- |
| `FoodItemService` | Command | Food CRUD | A |
| `AdminFoodQueries` | Query | Company food list | A |
| `PublicFoodQueries` | Query | Menu for a show | Pub |

### memberships

| Class | Kind | Responsibility | Called by |
| --- | --- | --- | --- |
| `MembershipPlanService` | Command | Platform plan CRUD | P |
| `MembershipOfferService` | Command | Company opt in/out, price | A |
| `MembershipPurchaseService` | Command | Create pending membership + payment | C |
| `MembershipActivationService` | Command | Activate on `payment.succeeded`, write ledger entries | W |
| `MembershipLookup` | Command (internal) | Active membership + discount for a customer and company | `booking` |
| `ClientMembershipQueries` | Query | My memberships | C |
| `PublicMembershipQueries` | Query | Plans a company sells | Pub |
| `AdminMembershipQueries` | Query | Company's offers | A |
| `PlatformMembershipQueries` | Query | Plans | P |

### booking

| Class | Kind | Responsibility | Called by |
| --- | --- | --- | --- |
| `BookingCheckoutService` | Command | Validate, claim seats, snapshot prices, create payment | C |
| `BookingCancellationService` | Command | Abandon a pending booking, release the hold | C |
| `BookingConfirmationService` | Command | Confirm, mark seats sold, issue ticket and invoice | W |
| `BookingExpiryService` | Command | Expire stale holds | W |
| `SeatClaimRepository` | Repository | Raw SQL for the seat claim | `BookingCheckoutService` |
| `TicketService` | Command | Issue ticket, sign QR | `BookingConfirmationService` |
| `TicketVerificationService` | Command | Verify QR, mark used once, record employee ID | A |
| `InvoiceService` | Command | Create mocked invoice, render PDF | `BookingConfirmationService`, C |
| `ClientBookingQueries` | Query | My orders, ticket, invoice, download | C |
| `AdminBookingQueries` | Query | Company bookings (theater scoped) | A |

### payments

| Class | Kind | Responsibility | Called by |
| --- | --- | --- | --- |
| `PaymentGateway` (interface) + `MockPaymentGateway`, `RazorpayPaymentGateway` | Gateway | Create order, verify webhook, refund | `PaymentService`, `RefundExecutionService` |
| `PaymentService` | Command | Create payment records for bookings and memberships | `booking`, `memberships` |
| `PaymentWebhookService` | Command | Verify signature, store event (inbox), mark payment, write outbox | Webhooks |
| `RefundExecutionService` | Command | Call gateway refund, write `refunds`, update booking | W |
| `ClientPaymentQueries` | Query | Payment history | C |

### refund-requests

| Class | Kind | Responsibility | Called by |
| --- | --- | --- | --- |
| `RefundRequestService` | Command | Customer creates; staff approve (amount) or reject | C, A |
| `ClientRefundQueries` | Query | My requests | C |
| `AdminRefundQueries` | Query | Review queue | A |

### ledger

| Class | Kind | Responsibility | Called by |
| --- | --- | --- | --- |
| `LedgerRecognitionService` | Command | Write commission and payouts after a show ends (idempotent) | W |
| `SettlementService` | Command | Record a payout, lock company row, reject overpayment | P |
| `LedgerAdjustmentService` | Command | Corrections with a memo | P |
| `PlatformLedgerQueries` | Query | Balances, settlements | P |

### support

| Class | Kind | Responsibility | Called by |
| --- | --- | --- | --- |
| `SupportTicketService` | Command | `raiseHelp` (C), `raiseMaintenance` and `raisePlatformRequest` (A), update, message | C, A, P |
| `WorkerAssignmentService` | Command | Assign/release gate and maintenance workers by employee ID | A |
| `ClientSupportQueries` | Query | My tickets | C |
| `AdminSupportQueries` | Query | Help and maintenance queue; own platform requests | A |
| `PlatformRequestQueries` | Query | Platform request queue | P |

### audit, reports, notifications

| Class | Kind | Responsibility | Called by |
| --- | --- | --- | --- |
| `AuditService` | Command (internal) | `record(tx, …)` inside the caller's transaction | Any command service |
| `PlatformAuditQueries` | Query | Audit log viewer | P |
| `AdminReportQueries` | Query | Company sales report | A |
| `PlatformDashboardQueries` | Query | Income, companies, bookings, pending payouts | P |
| `OutboxService` | Command (internal) | `add(tx, event)` | Any command service |
| `OutboxDispatcher` | Processor | Poll outbox, enqueue jobs | W |
| `MailEventHandler`s | Processor | Render and send emails for events | W |

## 4. Endpoint map: client surface

Prefix `/v1/client`. Guard: `@ClientOnly()`. Reads go through `Client…Queries`.

| Method | Path | Controller (`controllers/client/`) | Calls | Notes |
| --- | --- | --- | --- | --- |
| GET | `/me` | `client-profile.controller` | `ClientProfileQueries.get` | |
| PATCH | `/me` | `client-profile.controller` | `ClientProfileService.update` | |
| POST | `/bookings` | `client-bookings.controller` | `BookingCheckoutService.create` | `Idempotency-Key` |
| GET | `/bookings` | `client-bookings.controller` | `ClientBookingQueries.list` | Keyset pagination |
| GET | `/bookings/{id}` | `client-bookings.controller` | `ClientBookingQueries.get` | |
| POST | `/bookings/{id}/cancellation` | `client-bookings.controller` | `BookingCancellationService.abandon` | Pending only |
| GET | `/bookings/{id}/ticket` | `client-tickets.controller` | `ClientBookingQueries.ticket` | QR payload |
| GET | `/bookings/{id}/ticket/download` | `client-tickets.controller` | `ClientBookingQueries.ticketFile` | |
| GET | `/bookings/{id}/invoice` | `client-tickets.controller` | `InvoiceService.render` | Mocked |
| GET | `/payments` | `client-payments.controller` | `ClientPaymentQueries.list` | |
| POST | `/bookings/{id}/refund-requests` | `client-refund-requests.controller` | `RefundRequestService.create` | |
| GET | `/refund-requests` | `client-refund-requests.controller` | `ClientRefundQueries.list` | |
| POST | `/memberships` | `client-memberships.controller` | `MembershipPurchaseService.create` | `Idempotency-Key` |
| GET | `/memberships` | `client-memberships.controller` | `ClientMembershipQueries.list` | |
| POST | `/support-tickets` | `client-support.controller` | `SupportTicketService.raiseHelp` | |
| GET | `/support-tickets`, `/{id}` | `client-support.controller` | `ClientSupportQueries` | |
| POST | `/support-tickets/{id}/messages` | `client-support.controller` | `SupportTicketService.addMessage` | |

## 5. Endpoint map: admin surface

Prefix `/v1/admin`. Guard: `@StaffOnly()`. Tenant = `companyId` from the token; theater-scoped roles are further limited in every `Admin…Queries` and ownership check. Permission codes: [matrix](../api-design/api-design.md#45-permission-matrix).

| Method | Path | Controller (`controllers/admin/`) | Calls | Permission |
| --- | --- | --- | --- | --- |
| GET | `/me` | `admin-me.controller` | `AdminMeQueries.get` | any staff |
| GET | `/company` | `admin-company.controller` | `AdminCompanyQueries.get` | any staff |
| PATCH | `/company` | `admin-company.controller` | `CompanyPolicyService.update` | `company.manage` |
| PUT | `/company/membership-offers/{planId}` | `admin-membership-offers.controller` | `MembershipOfferService.upsert` | `membership.manage` |
| GET | `/company/membership-offers` | `admin-membership-offers.controller` | `AdminMembershipQueries.list` | `membership.manage` |
| GET | `/theaters`, `/theaters/{id}` | `admin-theaters.controller` | `AdminVenueQueries` | `theater.read` |
| POST/PATCH/DELETE | `/theaters`, `/theaters/{id}` | `admin-theaters.controller` | `TheaterService` | `theater.manage` |
| GET | `/theaters/{id}/screens`, `/screens/{id}` | `admin-screens.controller` | `AdminVenueQueries` | `screen.read` |
| POST/PATCH/DELETE | `/theaters/{id}/screens`, `/screens/{id}` | `admin-screens.controller` | `ScreenService` | `screen.manage` |
| PUT | `/screens/{id}/seats` | `admin-screens.controller` | `SeatLayoutService.replace` | `screen.manage` |
| GET | `/seat-categories` | `admin-seat-categories.controller` | `AdminVenueQueries` | `screen.read` |
| POST/PATCH/DELETE | `/seat-categories`, `/{id}` | `admin-seat-categories.controller` | `SeatCategoryService` | `screen.manage` |
| GET | `/shows`, `/shows/{id}` | `admin-shows.controller` | `AdminShowQueries` | `show.read` |
| POST | `/shows` | `admin-shows.controller` | `ShowService.create` | `show.manage` |
| PATCH | `/shows/{id}` | `admin-shows.controller` | `ShowService.update` | `show.manage` |
| PUT | `/shows/{id}/prices` | `admin-shows.controller` | `ShowService.setPrices` | `show.manage` |
| POST | `/shows/{id}/cancellation` | `admin-shows.controller` | `ShowCancellationService.cancel` | `show.cancel` |
| GET | `/food-items` | `admin-food.controller` | `AdminFoodQueries` | `food.read` |
| POST/PATCH/DELETE | `/food-items`, `/{id}` | `admin-food.controller` | `FoodItemService` | `food.manage` |
| GET | `/staff` | `admin-staff.controller` | `AdminStaffQueries` | `staff.read` |
| PATCH/DELETE | `/staff/{id}` | `admin-staff.controller` | `StaffService` | `staff.manage` |
| GET | `/staff-invitations` | `admin-staff.controller` | `AdminStaffQueries` | `staff.read` |
| POST | `/staff-invitations` | `admin-staff.controller` | `StaffInvitationService.invite` | `staff.manage` |
| GET | `/bookings`, `/bookings/{id}` | `admin-bookings.controller` | `AdminBookingQueries` | `booking.read` |
| POST | `/tickets/verify` | `admin-tickets.controller` | `TicketVerificationService.verify` | `ticket.verify` |
| GET | `/refund-requests` | `admin-refund-requests.controller` | `AdminRefundQueries.list` | `refund.review` |
| POST | `/refund-requests/{id}/approval` | `admin-refund-requests.controller` | `RefundRequestService.approve` | `refund.review` |
| POST | `/refund-requests/{id}/rejection` | `admin-refund-requests.controller` | `RefundRequestService.reject` | `refund.review` |
| GET | `/support-tickets`, `/{id}` | `admin-support.controller` | `AdminSupportQueries` | `support.handle` |
| POST | `/support-tickets` (maintenance) | `admin-support.controller` | `SupportTicketService.raiseMaintenance` | `support.handle` |
| POST | `/support-tickets` (platform request) | `admin-support.controller` | `SupportTicketService.raisePlatformRequest` | `platform_request.create` |
| PATCH | `/support-tickets/{id}` | `admin-support.controller` | `SupportTicketService.update` | `support.handle` |
| POST | `/support-tickets/{id}/messages` | `admin-support.controller` | `SupportTicketService.addMessage` | `support.handle` |
| GET | `/workers` | `admin-workers.controller` | `AdminSupportQueries.workers` | `worker.manage` |
| POST | `/workers` | `admin-workers.controller` | `WorkerAssignmentService.assign` | `worker.manage` |
| POST | `/workers/{id}/release` | `admin-workers.controller` | `WorkerAssignmentService.release` | `worker.manage` |
| GET | `/reports/sales` | `admin-reports.controller` | `AdminReportQueries.sales` | `report.read` |
| GET | `/movies`, `/cities` | `admin-catalog.controller` | `AdminCatalogQueries` | any staff |

Note: `POST /support-tickets` takes a `type` (`MAINTENANCE` or `PLATFORM_REQUEST`) and the service checks the matching permission for that type.

## 6. Endpoint map: public, auth, platform, webhooks

### Public (`/v1/public`, no auth)

| Method | Path | Controller (`controllers/public/`) | Calls |
| --- | --- | --- | --- |
| GET | `/cities` | `public-catalog.controller` | `PublicCatalogQueries.cities` |
| GET | `/movies`, `/movies/{id}` | `public-catalog.controller` | `PublicCatalogQueries` |
| GET | `/shows`, `/shows/{id}` | `public-shows.controller` | `PublicShowQueries` |
| GET | `/shows/{id}/seats` | `public-shows.controller` | `PublicShowQueries.seatMap` |
| GET | `/shows/{id}/food` | `public-shows.controller` | `PublicFoodQueries.forShow` |
| GET | `/companies/{id}/membership-offers` | `public-memberships.controller` | `PublicMembershipQueries.offers` |

### Auth (`/v1/auth`)

| Method | Path | Controller (`controllers/auth/`) | Calls |
| --- | --- | --- | --- |
| POST | `/register` | `auth.controller` | `AuthService.register` |
| POST | `/login`, `/refresh`, `/logout` | `auth.controller` | `AuthService` |
| POST | `/password/setup`, `/forgot`, `/reset` | `password.controller` | `PasswordService` |
| POST | `/invitations/{token}/accept` | `invitations.controller` | `StaffInvitationService.accept` |

### Platform (`/v1/platform`, super admin)

| Method | Path | Controller (`controllers/platform/`) | Calls |
| --- | --- | --- | --- |
| GET | `/companies`, `/companies/{id}` | `platform-companies.controller` | `PlatformCompanyQueries` |
| POST | `/companies` | `platform-companies.controller` | `CompanyOnboardingService.onboard` |
| PATCH | `/companies/{id}` | `platform-companies.controller` | `CompanyRatesService.update` |
| POST | `/companies/{id}/registration-fee` | `platform-companies.controller` | `CompanyOnboardingService.recordRegistrationFee` |
| CRUD | `/movies`, `/cities` | `platform-catalog.controller` | `MovieService`, `CityService`, `PlatformCatalogQueries` |
| CRUD | `/membership-plans` | `platform-membership-plans.controller` | `MembershipPlanService`, `PlatformMembershipQueries` |
| GET/POST | `/tax-rates` | `platform-tax.controller` | `PlatformTaxQueries`, `TaxRateService.add` |
| GET/PATCH | `/platform-requests` | `platform-requests.controller` | `PlatformRequestQueries`, `SupportTicketService` |
| GET | `/companies/{id}/balance` | `platform-ledger.controller` | `PlatformLedgerQueries.balance` |
| GET/POST | `/settlements` | `platform-ledger.controller` | `PlatformLedgerQueries`, `SettlementService.record` |
| POST | `/ledger-adjustments` | `platform-ledger.controller` | `LedgerAdjustmentService.adjust` |
| GET | `/audit-logs` | `platform-audit.controller` | `PlatformAuditQueries.search` |
| GET | `/dashboard` | `platform-dashboard.controller` | `PlatformDashboardQueries.get` |

### Webhooks (`/v1/webhooks`)

| Method | Path | Controller | Calls |
| --- | --- | --- | --- |
| POST | `/payments/{provider}` | `payment-webhook.controller` | `PaymentWebhookService.handle` |

## 7. Background work map (worker process)

| Trigger | Processor | Calls |
| --- | --- | --- |
| Outbox row | `OutboxDispatcher` | Enqueues the jobs below |
| `payment.succeeded` (booking) | `BookingConfirmationProcessor` | `BookingConfirmationService.confirm` |
| `payment.succeeded` (membership) | `MembershipActivationProcessor` | `MembershipActivationService.activate` |
| `payment.failed` / hold expiry job + per-minute sweep | `BookingExpiryProcessor` | `BookingExpiryService.expire` |
| Cron every minute | `ShowCompletionProcessor` | `ShowCompletionService.completeEnded` |
| After completion + sweep every 5 min | `LedgerRecognitionProcessor` | `LedgerRecognitionService.recogniseDue` |
| Show cancelled / refund approved | `RefundExecutionProcessor` | `RefundExecutionService.execute` |
| Mail events | `MailProcessor` | `MailService.send` |
| Daily cron | `HousekeepingProcessor` | purge expired tokens and idempotency keys |

## 8. Checks that keep this map true

- Lint: a controller's folder, class prefix and `@Controller` path must agree on the surface.
- Lint: `Client…Queries` may only be injected by controllers in `controllers/client/` (and likewise per audience).
- Test: every admin route has a permission decorator or is explicitly marked "any staff"; a test walks the Nest route table and fails otherwise.
- Test: every route listed here exists in `/docs-json`, and vice versa (contract check from api-design 6).
- Update this file in the same PR that adds or moves an endpoint or service.
