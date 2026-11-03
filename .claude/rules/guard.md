# Guards

- Global order: Throttler, JwtAuthGuard, TenantContextGuard, PermissionsGuard (registered in `AppModule`).
- `@Public()` skips all three; `@Authenticated()` on a route overrides a controller-level `@Public()`.
- Only TenantContextGuard decides the company. Services take `companyId` as a plain first parameter.
- Guards live in `common/auth/guards/` (JWT, permissions) and `common/tenancy/` (tenant). `PermissionsGuard` reads permissions through the `PERMISSIONS_LOOKUP` token, implemented by `rbac`'s `PermissionsService`, so `common/` never touches the database for it.
- After changing a role, a role's permissions or a staff member's active state, call `PermissionsService.evict(userId)`.
