---
paths:
  - 'src/modules/*/controllers/**/*.ts'
  - 'src/modules/*/http/**/*.ts'
  - 'src/health/**/*.ts'
---

# Controllers

- Flat in `controllers/`, only `*.controller.ts`. The file name starts with the surface: `admin-`, `client-`, `platform-`, `public-`, `auth-` (or exactly `auth.controller.ts`), `webhooks-`. Helpers that touch the request or response (cookies, headers) go in `http/`.
- Route prefix and surface decorator must match the file name (`admin-x.controller.ts` → `@Controller('v1/admin/x')` + `@AdminApi()`). The decorators are `PublicApi`, `AuthApi`, `ClientApi`, `AdminApi`, `PlatformApi`, `WebhookApi` in `common/auth/surfaces.ts`. `test/architecture` enforces the match.
- One controller never serves two surfaces. If admin and client both need "show details", write two controllers.
- Controllers only call services or queries. No business rules, no Prisma.
- Return a response DTO (or `Page<T>` from `buildPage`), never a Prisma row. Do not wrap it yourself: `ResponseEnvelopeInterceptor` adds the `{ isSuccess, statusCode, message, data, ... }` envelope, and `ProblemDetailsFilter` builds the error one.
- Status codes: `@Post` returns 201 by default; use `@HttpCode(200)` for actions that do not create (login, refresh), 202 for async, 204 for no body (return `void`).
- Take the caller from `@CurrentUser()` and the company from `@CurrentCompany()`; pass `user.id` / `companyId` to the service as plain parameters. Do not read `req.user` yourself.
- Use `@Res({ passthrough: true })` when you must set cookies or headers and still return a value.
- A route for any kind of logged-in user (like `GET /v1/auth/me`) lives in an `auth-` controller with `@Authenticated()`; it is not a company route and has no company context.
- Routes that create money or bookings and must be safe to retry take `@Idempotent()` (needs an `Idempotency-Key` header).
- Add a stricter `@Throttle(...)` on login, register and password routes.
