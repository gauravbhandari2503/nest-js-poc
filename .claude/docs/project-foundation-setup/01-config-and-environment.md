# Foundation 1 — Config and environment

Part of the [project foundation setup](README.md). Read this to see how configuration works, or to copy the setup into a new project.

## What it gives you

- One Zod schema ([src/config/env.validation.ts](../../../src/config/env.validation.ts)) is the source of truth for every environment variable. The app fails at startup with a readable error if a variable is missing or invalid.
- Three env files with separate jobs: `.env` (local dev, gitignored), `.env.example` (template, committed), `.env.test` (test DB, committed, no secrets).
- Integration/e2e tests and test migrations run against a separate database, never the dev one.

## How it works

1. `@nestjs/config` loads `.env` and passes the values through `validateEnv()` (the Zod schema).
2. Services read values with `ConfigService<Env, true>` and `config.get('KEY', { infer: true })`, so keys and types are checked at compile time.
3. Defaults live in the schema (`.default(...)`), not scattered through the code.
4. Variables only a script needs (the seed) are `.optional()` in the schema, so the app boots without them. The script enforces them itself.

## Variables added in this step

| Variable | Default | Used by |
| --- | --- | --- |
| `SEED_ADMIN_EMAIL` | none (optional, must be an email) | `prisma/seed.ts`: first super admin |
| `SEED_ADMIN_PASSWORD` | none (optional, min 12 chars) | `prisma/seed.ts`: hashed with argon2id |
| `BOOKING_HOLD_MINUTES` | 10 | how long a seat hold lasts |
| `SHOW_CLEANING_BUFFER_MINUTES` | 15 | gap enforced between shows on one screen |

QR signing keys and payment provider variables are deliberately not here yet. Add them in milestone 5.

## Test environment

- [.env.test](../../../.env.test) points `DATABASE_URL` at `book_my_ticket_test` and Redis at db `1`. It has throwaway secrets only, so it is committed.
- [vitest.config.e2e.ts](../../../vitest.config.e2e.ts) loads it with `override: true`. Test workers inherit it, and `ConfigModule` never overrides an existing `process.env` value.
- The test database is created by [docker/postgres-init.sql](../../../docker/postgres-init.sql). That file **only runs on a fresh volume**. If the DB is missing, run `pnpm infra:down -v && pnpm infra:up`, or `CREATE DATABASE book_my_ticket_test;` by hand.
- `pnpm prisma:migrate:test` runs `prisma migrate deploy` against the test DB. It works because `prisma.config.ts` imports `dotenv/config`, which honours `DOTENV_CONFIG_PATH=.env.test`.

## Setting this up in a new project

1. Create the Zod schema with `validateEnv()` and register it in `ConfigModule.forRoot({ validate: validateEnv, isGlobal: true })`.
2. Commit `.env.example` with every variable and a safe placeholder. Gitignore `.env`.
3. Add `.env.test` pointing at a separate database. Commit it only if it contains no real secrets.
4. Load `.env.test` in the e2e/integration vitest config.
5. Add the `prisma:migrate:test` script.
6. Create the test database in the docker init SQL.

## Adding a variable later

1. Add it to the Zod schema with a default if there is a sensible one.
2. Add it to `.env.example`, `.env.test` and your own `.env`.
3. Read it through `ConfigService<Env, true>`. Never read `process.env` directly in app code.

## Checks

`pnpm build`, `pnpm lint`, `pnpm format:check` pass. `pnpm prisma:migrate:test` connects to the test DB (no migrations yet).
