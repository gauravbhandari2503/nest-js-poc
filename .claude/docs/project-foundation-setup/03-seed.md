# Foundation 3 — Seed

Part of the [project foundation setup](README.md). Read this to see what data the database starts with, why, and how to extend it.

## What it gives you

Run `pnpm prisma:seed` (same as `pnpm prisma db seed`) after the migrations. The database then holds everything the app cannot run without:

| Data | Rows | Source |
| --- | --- | --- |
| Permissions | 20 | `ALL_PERMISSIONS` in [src/common/auth/permissions.ts](../../../src/common/auth/permissions.ts) |
| System roles | 2 (`COMPANY_OWNER`, `MAINTENANCE_STAFF`) | `SYSTEM_ROLE_PERMISSIONS` in the same file; 29 role-permission links |
| Super admin | 1 user | `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`, password hashed with argon2id |
| Tax rates | 3 (`TICKET` 18%, `FOOD` 5%, `MEMBERSHIP` 18%) | placeholders, effective 2026-01-01; the super admin owns the real values |
| States and cities | 36 states and union territories, 208 cities | [prisma/seed/cities.ts](../../../prisma/seed/cities.ts) |

Not seeded on purpose: membership plans and offers (business choices made by the super admin), customers, bookings, and company roles. Optional dev-only demo data is not built yet.

## Files

| File | Role |
| --- | --- |
| `prisma/seed.ts` | Entry point: reads and validates env (Zod, reusing the app schema), opens a Prisma client, calls `runSeed` |
| `prisma/seed/seed.ts` | The logic, one exported function per data set, so tests call them directly |
| `prisma/seed/cities.ts` | Reference data: state → cities |
| `prisma.config.ts` | `migrations.seed: 'tsx prisma/seed.ts'` registers the command with the Prisma CLI |

## Safe to run twice

Each step is keyed on a natural unique value and never overwrites data someone may have changed:

- **Permissions**: upsert by `code`. Codes no longer in the code are **deleted**, because the code is the source of truth (their role links cascade).
- **System roles**: looked up by name where `company_id IS NULL`, created if missing. Their permission links are synced to the code (extras removed, missing added). A plain upsert is not possible: the unique index is partial, and Prisma cannot target a partial index.
- **Super admin**: created once. If the email exists, nothing changes, and **the password is never reset**. If the email belongs to a non-admin user, the seed refuses and fails.
- **Tax rates**: inserted with `skipDuplicates` on `(item_type, effective_from)`. Rows are never edited; a new rate is a new row with a later date.
- **Cities**: inserted with `skipDuplicates` on `(name, state)`. To add a city, add it to `cities.ts` and run the seed again.

## Boot check

[PermissionsSyncService](../../../src/common/auth/permissions-sync.service.ts) runs when the API starts and compares the `permissions` table with `ALL_PERMISSIONS`. If they differ, the app refuses to start and the log says what is missing and to run the seed. This catches "deployed new code, forgot the seed" before guards deny or allow the wrong things. It was checked by deleting a permission from the dev database: the app failed with the message, and the seed restored it.

When you add a permission: add it to `Permission` in code, add it to the right entries of `SYSTEM_ROLE_PERMISSIONS`, run the seed.

## Env

| Variable | Used for |
| --- | --- |
| `SEED_ADMIN_EMAIL` | the super admin's login |
| `SEED_ADMIN_PASSWORD` | initial password, at least 12 characters. Change the dev placeholder in `.env`, and use a real secret outside local development |

`.env.test` has its own values for the test database.

## Tests

`test/db/seed.e2e-spec.ts` (run with `pnpm test:e2e test/db`) uses the real test database:

- running twice leaves every row count unchanged
- all permissions, both system roles, 3 tax rates and every city are present
- the owner role has every permission; maintenance staff has exactly its own
- the admin's argon2id hash verifies, and a second run with a different password does not change it
- a permission removed from code is deleted, and a deleted role link is restored
- an existing non-admin user is not adopted as super admin

`src/common/auth/permissions-sync.service.spec.ts` covers the boot check.

## Setting this up in a new project

1. Keep permission codes and the role matrix in one constant file in code.
2. Install `tsx` as a dev dependency and set `migrations.seed` in `prisma.config.ts`.
3. Write each seed step idempotently (upsert or `skipDuplicates`), never overwriting passwords or edited values.
4. Add the boot check so a missing seed fails loudly.
5. Seed the test database too (`pnpm prisma:seed:test`) and test that a second run changes nothing.
