# Foundation 6 — Tooling and CI

Part of the [project foundation setup](README.md). What checks run on every change, locally and on GitHub, and why CI is kept small.

## The checks

| Command | What it catches |
| --- | --- |
| `pnpm lint` | oxlint on `src/` and `test/` |
| `pnpm format:check` | Prettier formatting |
| `pnpm typecheck` | `tsc --noEmit` over the whole project (vitest and `nest build` do not type-check tests or `prisma/`) |
| `pnpm build` | `nest build` |
| `pnpm test` | Unit tests and the architecture rules (mocks only, no database) |
| `pnpm test:e2e` | Integration tests against the **real test database** (`book_my_ticket_test`, from `.env.test`) and the app e2e test |

Locally, Husky runs `lint-staged` (oxlint + Prettier on staged files) before each commit.

## GitHub Actions ([.github/workflows/ci.yml](../../../.github/workflows/ci.yml))

One job, on pushes to `master` and on pull requests; a newer push cancels the older run of the same branch. It starts Postgres 17 and Redis 7 as service containers, then runs, in order: install, `prisma generate`, lint, format check, typecheck, build, unit tests, migrate the test database, seed it, integration/e2e tests.

**Why CI at all for a proof of concept:** it costs one small workflow, and without it the most valuable tests (the database constraints that protect seats and money, see [foundation 2](02-database.md)) only run when someone remembers to. It deliberately does **not** deploy, build Docker images, run a version matrix or collect coverage. Add those when there is something to deploy.

**How the database is wired:** the Postgres service is published on port **5433** and the database is named `book_my_ticket_test`, so it matches `DATABASE_URL` in the committed `.env.test`. The workflow needs no secrets and no `.env` file. The same file drives local runs, so CI and your machine cannot drift.

## Checking CI without pushing

CI starts from nothing, so the way to check it locally is to recreate that state:

```bash
docker exec nestjs-poc-postgres-1 psql -U postgres -c 'DROP DATABASE IF EXISTS book_my_ticket_test WITH (FORCE)'
docker exec nestjs-poc-postgres-1 psql -U postgres -c 'CREATE DATABASE book_my_ticket_test'
mv .env /tmp/dotenv.bak            # the runner has no .env
pnpm prisma:generate && pnpm lint && pnpm format:check && pnpm typecheck && pnpm build && pnpm test
pnpm prisma:migrate:test && pnpm prisma:seed:test && pnpm test:e2e
mv /tmp/dotenv.bak .env
```

This was run when the workflow was written: all steps passed from an empty database and no `.env`.

## Fixed in this step

- `test/app.e2e-spec.ts` imported `supertest/types`, which does not exist in `@types/supertest` 7, so `tsc` failed even though vitest ran the test. The import was unnecessary and was removed; `pnpm typecheck` is now clean and part of CI.
- The old workflow only ran unit tests with hand-written env values; it now uses `.env.test` and also runs the integration tests.
