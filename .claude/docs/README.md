# Book My Ticket — Documentation Index

Status: **design phase. No feature code until these docs are approved.**

## Reading order

| # | Doc | Read it to understand | Audience |
| --- | --- | --- | --- |
| 1 | [Domain specification](domain-specification/domain-specification.md) | What the product does and the business rules | Everyone |
| 2 | [Tech stack](tech-stack/tech-stack.md) | The fixed technology choices | Everyone |
| 3 | [Project architecture](project-architecture/project-architecture.md) | Code layout, modules, layering, conventions, how to add a feature, delivery plan | **New developers start here** |
| 3a | [Service and endpoint map](project-architecture/service-and-endpoint-map.md) | **Lookup page**: endpoint → controller → service → permission, split by client / admin / platform / public; service catalogue per module; worker jobs | Developers, frontend |
| 4 | [System design](system-design/system-design.md) | Patterns and decisions: booking path, async work, money flow, security, failure modes, ADRs | Developers, reviewers |
| 5 | [Database design](database-design/database-design.md) | Tables, constraints, indexes, critical queries, migration rules | Developers, reviewers |
| 6 | [API design](api-design/api-design.md) | REST conventions, error catalogue, endpoint catalogue | Developers, frontend |

## Decisions

Confirmed by the product owner and applied to the docs:

| # | Decision |
| --- | --- |
| 1 | **Seat holds are Postgres-only** (ADR-002). Redis is for caching, rate limiting, BullMQ (and the permission cache). An expired hold can never block a seat: the claim releases a conflicting hold that has expired inside its own transaction, and a per-minute sweep job keeps booking status tidy |
| 2 | **Commission applies to tickets and food**, calculated on the **pre-tax** amount. Ticket commission base is the post-discount price. Tax is passed through to the company's payable balance |
| 3 | **Only the membership discount exists in v1**, and it applies to **tickets only** |
| 4 | **Partial refund**: the company keeps the remainder; commission is calculated on it at show completion |
| 5 | **Transactional outbox** and **composite tenant foreign keys** are approved |

## Still assumed (not yet confirmed)

Small defaults the docs use. Correct any that is wrong; none blocks milestone 0.

| # | Question | Assumed |
| --- | --- | --- |
| A | Which commission **rate** applies to food? The spec has only ticket and membership rates | The company's single sales rate (`companies.sales_commission_bps`) covers tickets and food. A separate food rate is an additive change later |
| B | After an approved refund before the show, are seats **released for resale**? | Yes |
| C | Two overlapping memberships with the same company? | No; one active per company, renewal after expiry |
| D | Custom roles per company? | Two seeded system roles in v1; the schema is ready for custom roles |
| E | First **super admin** | Seed script from env variables |
| F | Currency | INR only; `currency` column kept |
| G | Food scope | Per company, optionally limited to one theater |
| H | Company cancels a show after it started? | Not allowed; only before `starts_at` |
| I | Refresh token storage on the client | `HttpOnly` cookie (client and API must share a site or a configured cookie domain) |

## Verification status

| Check | Status |
| --- | --- |
| Schema DDL runs on Postgres 17; constraints, triggers and the seat-claim flow behave as designed; 20-way concurrent race yields one winner | Done, see "Verification record" in [database-design](database-design/database-design.md) |
| All 13 Mermaid diagrams render (headless Chrome, mermaid 11) | Done |
| Master permission list (`src/common/auth/permissions.ts`, unit-tested) | Done; the seed that writes it to the database lands with the schema in milestone 1 |

## Conventions for these docs

- Mermaid diagrams render in GitHub and in VS Code (Markdown Preview Mermaid extension).
- A doc owns its topic; others link to it rather than repeat it.
- Update the doc in the same PR that changes the design. An ADR that is superseded is marked, not deleted.
