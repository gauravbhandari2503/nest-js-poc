---
paths:
  - 'src/**/*.spec.ts'
  - 'test/**/*.ts'
---

# Tests

- Unit tests (`*.spec.ts`) live in a `__tests__/` folder inside the folder of the code they test: `controllers/__tests__/x.controller.spec.ts`, `domain/__tests__/duration.spec.ts`. They use no database, Redis or network; mock with `vitest-mock-extended`. `describe`, `it`, `expect` and `vi` are globals.
- HTTP and database tests (`*.e2e-spec.ts`) live in the top-level `test/` folder, grouped by area (`test/auth`, `test/db`). They run against the test database (`.env.test`, `book_my_ticket_test`), never the dev one, and need `pnpm infra:up` first. Build the app with `createApp()` from `test/auth/helpers.ts`.
- Every module: unit tests for rules, an e2e test per endpoint group, and for admin endpoints a cross-tenant test (company A's token gets 404 for company B's id).
- E2e assertions read the envelope: success data is under `body.data`, errors are `body.code` (the stable catalogue code) and `body.description`. Assert on `code`, not `message`.
- Tests make their own data with unique emails (`uid()`) so they do not depend on run order or leftovers.
- Auth routes are throttled; the e2e helper overrides the throttler storage, so do not add sleeps.
- Before finishing: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm build && pnpm test && pnpm test:e2e`.
