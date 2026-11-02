# Project foundation setup

A step-by-step record of how the project foundation was built, in the order it was done. Each step has its own doc: what was set up, why, and how to repeat it in a new project. Add a new numbered doc for every foundation step.

| # | Step | Doc |
| --- | --- | --- |
| 1 | Config and environment | [01-config-and-environment.md](01-config-and-environment.md) |
| 2 | Database: schema, migrations, constraint tests, connecting a DB UI | [02-database.md](02-database.md) |
| 3 | Seed: permissions, roles, super admin, tax rates, states and cities | [03-seed.md](03-seed.md) |
| 4 | Errors (RFC 7807), access decorators and guards, tenancy (incl. super admin acting on a company) | [04-errors-auth-tenancy.md](04-errors-auth-tenancy.md) |
| 5 | Shared building blocks: money, pagination, outbox, idempotency, Swagger surfaces, architecture rules | [05-shared-building-blocks.md](05-shared-building-blocks.md) |

Planned next: 6 Tooling and CI (GitHub Actions, e2e fixes), 5 Tooling and CI. Tracking lives in the `todo` file at the repo root.
