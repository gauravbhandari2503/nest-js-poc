import { DomainError } from '../../errors/domain-error.js';
import { ErrorCode } from '../../errors/error-codes.js';

/** Position of the last row on a page: its sort value and its id (the tie-breaker). */
export interface Cursor {
  sortKey: string | number;
  id: string;
}

/** Opaque to clients: base64url of `{ c: sortKey, i: id }`. Never exposes offsets. */
export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(
    JSON.stringify({ c: cursor.sortKey, i: cursor.id }),
  ).toString('base64url');
}

export function decodeCursor(value: string): Cursor {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    );
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'c' in parsed &&
      'i' in parsed &&
      (typeof parsed.c === 'string' || typeof parsed.c === 'number') &&
      typeof parsed.i === 'string'
    ) {
      return { sortKey: parsed.c, id: parsed.i };
    }
  } catch {
    // fall through to the error below
  }
  throw new DomainError(ErrorCode.ValidationFailed, 'Invalid cursor', {
    errors: [{ field: 'cursor', message: 'is not a valid cursor' }],
  });
}

/** Dates are stored in cursors as ISO strings. */
export const dateSortKey = (date: Date): string => date.toISOString();
