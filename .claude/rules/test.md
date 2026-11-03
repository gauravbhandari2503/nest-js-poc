# Tests

- Unit tests (`*.spec.ts`) live in a `__tests__/` folder inside the folder of the code they test: `controllers/__tests__/x.controller.spec.ts`, `domain/__tests__/duration.spec.ts`.
- HTTP and database tests (`*.e2e-spec.ts`) live in the top-level `test/` folder, grouped by area (`test/auth`, `test/db`).
- Every module: unit tests for rules, an e2e test per endpoint group, and for admin endpoints a cross-tenant test (company A's token gets 404 for company B's id).
- Before finishing: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm build && pnpm test && pnpm test:e2e`.
