export class AuditActorDto {
  id: string | null;
  kind: string;
  email: string | null;
  fullName: string | null;
}

export class AuditLogDto {
  id: string;
  occurredAt: Date;
  actor: AuditActorDto;
  companyId: string | null;
  module: string;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  correlationId: string;
  ip: string | null;
}
