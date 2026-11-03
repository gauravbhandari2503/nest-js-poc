import { createHmac, randomBytes } from 'node:crypto';

/** A fresh opaque token: 256 random bits, url-safe. Only its hash is stored. */
export const newOpaqueToken = () => randomBytes(32).toString('base64url');

/** Keyed hash, so a leaked `auth_tokens` / `refresh_tokens` table cannot be replayed or brute-forced offline. */
export const hashToken = (secret: string, token: string) =>
  createHmac('sha256', secret).update(token).digest('hex');
