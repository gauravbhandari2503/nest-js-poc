---
paths:
  - 'src/**/dto/**/*.ts'
---

# DTOs

- Shared DTOs sit at the `dto/` root of the module. Use `dto/admin/` or `dto/client/` only when the surfaces need different shapes.
- Never return Prisma models; map to a response DTO per audience, and copy fields explicitly (so a new column such as `passwordHash` can never leak).
- Request DTOs use class-validator. Trim and lowercase emails with `@Transform`. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so every accepted field needs a decorator.
- Response DTOs describe `data` only. The envelope around it is `ApiResponseDto` in `common/dto/api-response.dto.ts`; do not repeat `isSuccess`, `statusCode` or `correlationId` in a DTO.
- Lists: return `Page<T>` (`{ items, page: { nextCursor, hasMore } }`) built with `buildPage()`. Collection requests extend `PaginationQueryDto` (`limit`, `cursor`). Keyset pagination only, never `OFFSET`.
- Swagger's compiler plugin reads the class properties, so use classes (not interfaces or type aliases) for anything a controller returns. Add `@ApiProperty` only for what the plugin cannot infer.
- Use `import type` for imports used only as types, except for DTO classes a controller uses as a parameter type: those need a real import for Nest's metadata.
