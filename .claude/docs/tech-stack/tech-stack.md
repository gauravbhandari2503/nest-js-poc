# Movie Booking API — Tech Stack

Oct 30, 2026 · @Gaurav

## Tech stack

All choices below are final for v1; anything marked "later" is added in the phase that needs it.

| Area | Choice | Notes |
| --- | --- | --- |
| Runtime / language | Node.js LTS, TypeScript (strict) | pnpm as package manager |
| Framework | NestJS (REST) | Separate repo from the frontend |
| Database | PostgreSQL 17 | Transactions and row locking for seat booking |
| ORM | Prisma | Raw SQL via `$queryRaw` only where locking needs it |
| Validation | `class-validator` + `class-transformer` | Global `ValidationPipe`, `whitelist: true` |
| Config | `@nestjs/config` + Zod env schema | App fails fast on missing or invalid env |
| Auth | `@nestjs/jwt`, `@nestjs/passport`, `passport-jwt`, `argon2` | Access + refresh tokens, email/password only |
| Authorization | Nest Guards + custom `@Roles()` | Ownership checks in services; CASL only if rules grow |
| Cache / locks | Redis 7 (`ioredis`) | Seat holds, rate limiting, selective caching |
| Queues / workers / cron | BullMQ via `@nestjs/bullmq` | Separate worker process; Bull Board dashboard |
| Email | `nodemailer` behind a `MailService` interface | Mailpit locally |
| Request context | `nestjs-cls` | Correlation ID available everywhere |
| Logging | `nestjs-pino` | JSON logs with correlation ID |
| API docs | `@nestjs/swagger` + CLI plugin | `/docs` and `/docs-json` |
| Security | `helmet`, `@nestjs/throttler` (Redis store) | CORS restricted to the frontend origin |
| Health | `@nestjs/terminus` | `GET /health` checks Postgres and Redis |
| File storage (later) | MinIO, S3-compatible | Movie posters |
| Payments (later) | Stripe or Razorpay test mode | Webhooks + idempotency |
| Testing | Jest, `@nestjs/testing`, `supertest`, `jest-mock-extended` | Separate test database |
| Code quality | ESLint, Prettier, Husky + lint-staged | Lint and format on commit |
| CI | GitHub Actions | Lint, test, build on every push |