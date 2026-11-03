# DTOs

- Shared DTOs sit at the `dto/` root. Use `dto/admin/` or `dto/client/` only when the surfaces need different shapes.
- Never return Prisma models; map to a response DTO per audience.
- Request DTOs use class-validator; trim and lowercase emails with `@Transform`.
