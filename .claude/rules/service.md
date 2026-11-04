---
paths:
  - 'src/modules/*/services/**/*.ts'
  - 'src/modules/*/queries/**/*.ts'
  - 'src/modules/*/domain/**/*.ts'
  - 'src/modules/*/repositories/**/*.ts'
---

# Services

- Command services (`services/`) change state and hold the business rules. They take the actor and `companyId` explicitly as plain parameters and never read the request, cookies or headers.
- Query services (`queries/`) are read-only (enforced by `test/architecture`: no `create`, `update`, `delete`, `upsert` or raw writes), named by audience (`Admin…Queries`, `Client…Queries`) and scoped accordingly. An admin query always filters by `companyId`.
- Throw `DomainError(ErrorCode.X, 'message', extensions?)` with a code from `common/errors/error-codes.ts`; the status comes from the code, so services never pick HTTP statuses. Add a new code (and its status and the catalogue in `api-design.md`) instead of reusing a loose one.
- A company's data is never reachable with another company's id: look rows up by `{ id, companyId }` and answer `NOT_FOUND`, not `FORBIDDEN`, when it is not theirs.
- Pure rules go in `domain/` (no Nest, no Prisma), so they can be unit tested without a database.
- Prisma is used directly; add a `repositories/` class only when a query is reused or needs raw SQL.
- Do not send email inline from a command that must not fail because of mail: add an outbox event (`infra/outbox`) and let a handler send it. Direct sending is acceptable only where a failure is logged and ignored on purpose (`PasswordService.forgot`).
- Work that must be atomic goes in one `prisma.$transaction`; do slow work such as hashing before opening it.
- Do not leak whether an account exists: login, forgot-password and invalid links answer with one generic code and message.
