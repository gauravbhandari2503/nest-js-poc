# Foundation 4 — Errors, auth decorators and tenancy

Part of the [project foundation setup](README.md). This step covers three of the milestone 0 building blocks that every feature uses: one error format, the access decorators and guards, and the rule for "which company is this request about". Decision record: [ADR-010](../system-design/system-design.md).

## 1. Errors: RFC 7807 everywhere

| File | Role |
| --- | --- |
| [src/common/errors/error-codes.ts](../../../src/common/errors/error-codes.ts) | `ErrorCode` constants and the HTTP status of each, matching the [error catalogue](../api-design/api-design.md) |
| [domain-error.ts](../../../src/common/errors/domain-error.ts) | `new DomainError(ErrorCode.SeatUnavailable, 'Seats A5 taken', { seatIds })`. The status comes from the code, so services never pick HTTP statuses |
| [problem-details.filter.ts](../../../src/common/filters/problem-details.filter.ts) | Global filter (`APP_FILTER`): renders `application/problem+json` with `type`, `title`, `status`, `code`, `detail`, `instance`, `correlationId` and any extensions |
| [validation.ts](../../../src/common/pipes/validation-exception.factory.ts) | `exceptionFactory` of the global `ValidationPipe`: DTO failures become `422 VALIDATION_FAILED` with `errors: [{ field, message }]` (nested fields as `food.quantity`) |

Rules: throw `DomainError` for business failures; framework exceptions (404, 401, 429…) are mapped to catalogue codes; anything unexpected becomes `500 INTERNAL` with a generic message, and the real error goes to the log with the correlation id. Stack traces, SQL and Prisma messages never reach a client. To add a code: add it to `ErrorCode` and `ERROR_STATUS`, and to the catalogue table in api-design.

## 2. Access decorators and guards

| Piece | What it does |
| --- | --- |
| `@Public()` | No authentication (login, public catalog, webhooks) |
| `@ClientOnly()` | Customers only (`/v1/client`) |
| `@StaffOnly()` | Company routes (`/v1/admin`): staff **and the super admin acting on a company** |
| `@PlatformOnly()` | Super admin only (`/v1/platform`) |
| `@RequirePermissions(Permission.ShowManage)` | Every listed permission is required |
| `@CurrentUser()` / `@CurrentCompany()` | Parameter decorators: the authenticated user, and the company the request acts on |
| `PermissionsGuard` | Checks the account type from the decorators above, then the permissions |
| `PermissionsService.forUser()` (in `modules/rbac`, reached by the guard via `PERMISSIONS_LOOKUP`) | The one answer to "what may this user do?" |

`PermissionsService` returns: **every permission for a super admin**, the role's permissions for active staff, nothing for deactivated staff or customers. The permission guard and `GET /v1/auth/me` both use it. The frontend works with permission codes only (never role names), so the super admin's `/me` lists all codes, and what the UI shows always matches what the server allows.

Staff permissions are cached in Redis for 60 s (`permissions:<userId>`). Code that changes a role, a role's permissions or a staff member's active state must call `PermissionsService.evict(userId)`; otherwise the change shows up within a minute. If Redis is down the service reads the database.

## 3. Tenancy: which company is this request about?

[TenantContextGuard](../../../src/common/tenancy/tenant-context.guard.ts) is the **only** place that decides, and [TenantContext](../../../src/common/tenancy/tenant-context.ts) (on `nestjs-cls`) carries the answer for the rest of the request.

| Caller on a `@StaffOnly` route | Company comes from | Errors |
| --- | --- | --- |
| Staff | their token; an `X-Company-Id` header is **ignored** | 403 if the token has no company |
| Super admin | the `X-Company-Id` header | 400 `COMPANY_CONTEXT_REQUIRED` if missing or not a uuid; 404 if the company does not exist |
| Customer | n/a | 403 |

For a super admin, `TenantContext.actingAs` is true so audit logs can record "super admin X acted on company Y". Services still take `companyId` as a plain first parameter and cannot tell staff from super admin, so there are no `if (superAdmin)` branches in feature code.

On routes that are not `@StaffOnly` the guard only records the user; no company is set.

## Global guard order

Registered in `AppModule` as `APP_GUARD`s, in this order: Throttler → [JwtAuthGuard](../../../src/common/auth/guards/jwt-auth.guard.ts) (skips `@Public`) → TenantContextGuard → PermissionsGuard. The last two also skip `@Public` routes. `@Authenticated()` on a single route overrides a controller-level `@Public()` (used by `POST /v1/auth/password/change`). Every controller must therefore carry a surface decorator or `@Public()`; a route with neither requires a login but no particular account type.

## Tests

`pnpm test` covers (all with mocks, no database):

- filter: DomainError fields and extensions, framework exceptions mapped, validation 422 with nested field names, unexpected errors hidden behind a 500
- tenant guard: staff ignore the header; super admin needs a valid existing company; customers and token-less staff rejected; no company on platform routes
- permission service and guard: super admin holds every code, staff only their role's, deactivated staff nothing; account-type rules for admin, platform and client routes

HTTP-level tests of the wired-up guards are in `test/auth/auth.e2e-spec.ts` (see [identity and rbac](../project-architecture/build-plan.md)). Cross-tenant 404 tests per endpoint start with the first company-scoped endpoints in milestone 3.
