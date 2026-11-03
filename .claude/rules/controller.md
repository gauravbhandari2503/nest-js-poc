# Controllers

- Flat in `controllers/`. The file name starts with the surface: `admin-`, `client-`, `platform-`, `public-`, `auth-` (or exactly `auth.controller.ts`), `webhooks-`.
- Route prefix and surface decorator must match the file name (`admin-x.controller.ts` → `@Controller('v1/admin/x')` + `@AdminApi()`). `test/architecture` enforces it.
- Controllers only call services or queries. No rules, no Prisma.
- One controller never serves two surfaces.
