# Movie Booking API — Tech Stack

Oct 30, 2026 · @Gaurav

## Tech stack

All choices below are final for v1; anything marked "later" is added in the phase that needs it.

| Area | Choice | Notes |
| --- | --- | --- |
| Runtime / language | Node.js 22 LTS, TypeScript (strict, ESM / `nodenext`) | pnpm as package manager |
| Framework | NestJS (REST) | Separate repo from the frontend |
| Database | PostgreSQL 17 | Transactions and row locking for seat booking |
| ORM | Prisma 7 (`prisma-client` generator, `@prisma/adapter-pg`) | Client generated into `src/generated` (gitignored); raw SQL via `$queryRaw` only where locking needs it |
| Validation | `class-validator` + `class-transformer` | Global `ValidationPipe`, `whitelist: true` |
| Config | `@nestjs/config` + Zod env schema | App fails fast on missing or invalid env |
| Auth | `@nestjs/jwt`, `@nestjs/passport`, `passport-jwt`, `argon2` | Access + refresh tokens, email/password only |
| Authorization | Nest Guards + custom `@Roles()` | Ownership checks in services; CASL only if rules grow |
| Cache / rate limiting | Redis 7 (`ioredis`) | Rate limiting, permission cache, selective read caching. Seat holds live in Postgres (ADR-002) |
| Queues / workers / cron | BullMQ via `@nestjs/bullmq` | Separate worker process; Bull Board dashboard |
| Email | `nodemailer` behind a `MailService` interface | Mailpit locally |
| Request context | `nestjs-cls` | Correlation ID available everywhere |
| Logging | `nestjs-pino` | JSON logs with correlation ID |
| API docs | `@nestjs/swagger` + CLI plugin | `/docs` and `/docs-json` |
| Security | `helmet`, `@nestjs/throttler` (Redis store) | CORS restricted to the frontend origin |
| Health | `@nestjs/terminus` | `GET /health` checks Postgres and Redis |
| File storage (later) | MinIO, S3-compatible | Movie posters |
| Payments (later) | Stripe or Razorpay test mode | Webhooks + idempotency |
| Testing | Vitest, `@nestjs/testing`, `supertest`, `vitest-mock-extended` | Separate test database (`book_my_ticket_test`) |
| Code quality | oxlint, Prettier, Husky + lint-staged | Lint and format on commit |
| CI | GitHub Actions | Lint, format check, build, test on every push |
| Observability | `@nestjs/observe` | Tracing and metrics; app keys still placeholders |
| Local HTTPS | mkcert, served directly by Nest | `pnpm certs` generates `./certs` (gitignored); `https://bookmyticket.test:3000` |
| Local infrastructure | Docker Compose | Postgres 17 (host port 5433), Redis 7, Mailpit |