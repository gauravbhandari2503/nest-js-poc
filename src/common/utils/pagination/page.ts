import { encodeCursor, type Cursor } from './cursor.js';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export class PageInfoDto {
  /** Pass it as `?cursor=` to get the next page; null on the last page. */
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * The `data` of every paginated endpoint, inside the response envelope:
 * `{ data: { items: [...], page: { nextCursor, hasMore } } }`.
 */
export interface Page<T> {
  items: T[];
  page: PageInfoDto;
}

/**
 * Turns the rows of a keyset query into a response. Query for `limit + 1` rows
 * (`take: pageQueryLimit(limit)`): the extra row only says whether another page exists.
 */
export function buildPage<T>(
  rows: readonly T[],
  limit: number,
  toCursor: (row: T) => Cursor,
): Page<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : [...rows];
  const last = items.at(-1);
  return {
    items,
    page: {
      nextCursor: hasMore && last ? encodeCursor(toCursor(last)) : null,
      hasMore,
    },
  };
}

/** How many rows to fetch for a page of `limit`. */
export const pageQueryLimit = (limit: number): number => limit + 1;
