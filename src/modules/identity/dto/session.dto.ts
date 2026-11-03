import type { UserKind } from '../../../generated/prisma/client.js';

export class SessionUserDto {
  id: string;
  email: string;
  fullName: string;
  kind: UserKind;
  companyId?: string;
}

/** The refresh token travels in an HttpOnly cookie, never in this body. */
export class SessionDto {
  accessToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  user: SessionUserDto;
}
