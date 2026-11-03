/** Cookie holding the access token for browser clients (the same JWT as the bearer header). */
export const ACCESS_COOKIE = 'access_token';

/** One cookie's value from a `Cookie` header, or undefined. */
export function readCookie(header: unknown, name: string): string | undefined {
  if (typeof header !== 'string') return undefined;
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}
