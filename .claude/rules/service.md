# Services

- Command services (`services/`) change state, take the actor and `companyId` explicitly, never read the request.
- Query services (`queries/`) are read-only (enforced by `test/architecture`), named by audience (`Admin…Queries`, `Client…Queries`) and scoped accordingly.
- Throw `DomainError` with a catalogue code; services never pick HTTP statuses.
- Pure rules go in `domain/` (no Nest, no Prisma).
