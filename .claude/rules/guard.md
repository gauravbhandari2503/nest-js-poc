---
paths:
  - 'src/common/auth/**/*.ts'
  - 'src/common/tenancy/**/*.ts'
  - 'src/app.module.ts'
---

# Guards

- Global order, registered with `APP_GUARD` in `AppModule`: Throttler, JwtAuthGuard, TenantContextGuard, PermissionsGuard. Order in the providers array is the run order; keep every global guard in `AppModule`. Each later guard may rely on what the earlier one set (`request.user`, then `request.companyId`).
- `@Public()` skips all three; `@Authenticated()` on a route overrides a controller-level `@Public()`. Every guard must read `IS_PUBLIC_KEY` with `getAllAndOverride` over `[handler, class]`.
- Access tokens come from the `Authorization: Bearer` header, or else the `access_token` HttpOnly cookie. For a cookie-authenticated write, an `Origin` other than `FRONTEND_ORIGIN` is rejected (CSRF); no `Origin` is allowed. A wrong or non-Bearer header never falls back to the cookie.
- Only TenantContextGuard decides the company: staff from their token (the header is ignored), a super admin from `X-Company-Id`. Services take `companyId` as a plain first parameter.
- A route is a company route when its allowed kinds include `STAFF` (`@StaffOnly()`, which `@AdminApi()` applies). Do not decide that from the URL.
- Guards live in `common/auth/guards/` (JWT, permissions) and `common/tenancy/` (tenant). `PermissionsGuard` reads permissions through the `PERMISSIONS_LOOKUP` token, implemented by `rbac`'s `PermissionsService`, so `common/` never touches the database for it.
- Guards throw `DomainError` with a catalogue code (`UNAUTHENTICATED`, `TOKEN_EXPIRED`, `FORBIDDEN`, `COMPANY_CONTEXT_REQUIRED`); they never set HTTP statuses.
- Permissions are not in the token. After changing a role, a role's permissions or a staff member's active state, call `PermissionsService.evict(userId)`.
- Guard unit tests live in `__tests__/` next to the guard; use `fakeContext` from `common/auth/guards/__tests__/testing.ts`.
