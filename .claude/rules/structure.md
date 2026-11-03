# Source layout

- `src/infra/`: adapters to external systems (prisma, redis, mail, outbox, later payment). No business logic.
- `src/config/`: env loading and validation (`env.validation.ts`).
- `src/common/`: glue with no business logic and **no database access through business services**. Two organising rules, never mixed in one folder:
  - **By concern**, when the concern has its own module: `auth/` (types, permission catalog, decorators, surface decorators, `guards/` for JWT and permissions) and `tenancy/` (tenant context, `TenantContextGuard`). A concern's guards and decorators live inside it.
  - **By type**, for generic glue only: `filters/`, `interceptors/`, `pipes/`, `dto/`, `errors/`, `utils/`.
- `src/modules/<name>/`: one folder per business concept: `<name>.module.ts`, `index.ts` (public API), `controllers/`, `services/`, `queries/`, `repositories/`, `domain/`, `dto/`, `constants/`.
  - `controllers/` holds only `*.controller.ts`. Controller helpers go in `http/`, general helpers in `utils/`.
  - `services/` = commands: writes and business rules. `queries/` = read-only Prisma reads for GET endpoints. The architecture test fails if `queries/` contains a write.
- `common/` and `infra/` never import from `modules/`. When `common/` needs an answer a module owns (e.g. a user's permissions), it declares an interface plus an injection token in `common/` and the module provides it (`PERMISSIONS_LOOKUP` ← `rbac`'s `PermissionsService`).
- Modules import each other only through `index.ts`. `app.module.ts` and `worker.module.ts` are exempt.
- No barrel files per folder. The module `index.ts` is the only one.
- `src/health/` is an operational exception at the root. Do not add other top-level folders under `src/`.
- Jobs (later): the outbox dispatcher lives in `infra/outbox`; each feature has its own `jobs/` (processors, outbox handlers) and `WorkerModule` imports `CoreModule` plus those job modules.
