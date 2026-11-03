import type { Request, Response } from 'express';
import { ACCESS_COOKIE, readCookie } from '../../../common/auth/cookies.js';
import type { IssuedSession } from '../services/token.service.js';

const REFRESH_COOKIE = 'refresh_token';
/** Scoped to the auth routes, so the refresh token is not sent with every API call. */
const REFRESH_PATH = '/v1/auth';

const BASE = { httpOnly: true, secure: true, sameSite: 'lax' } as const;

/**
 * Both tokens as HttpOnly cookies. The access token cookie is for browsers (no token
 * handling in the frontend); the body still carries it for clients that send the header.
 */
export function setSessionCookies(res: Response, session: IssuedSession) {
  res.cookie(ACCESS_COOKIE, session.accessToken, {
    ...BASE,
    path: '/',
    maxAge: session.expiresIn * 1000,
  });
  res.cookie(REFRESH_COOKIE, session.refreshToken, {
    ...BASE,
    path: REFRESH_PATH,
    expires: session.refreshExpiresAt,
  });
}

export function clearSessionCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, { ...BASE, path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...BASE, path: REFRESH_PATH });
}

export function readRefreshCookie(req: Request): string | undefined {
  return readCookie(req.headers.cookie, REFRESH_COOKIE);
}
