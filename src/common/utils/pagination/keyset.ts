import type { Cursor } from './cursor.js';

export type SortDirection = 'asc' | 'desc';

/**
 * Prisma `where` fragment for "rows after this cursor" under a fixed order of
 * `(sortField, id)`. Combine it with the endpoint's own filters using `AND`.
 *
 *   const rows = await prisma.booking.findMany({
 *     where: { AND: [{ customerId }, keysetWhere('createdAt', cursor, 'desc', revive)] },
 *     orderBy: keysetOrderBy('createdAt', 'desc'),
 *     take: pageQueryLimit(limit),
 *   });
 *
 * `revive` converts the cursor's stored value back into the column's type (an ISO
 * string back into a `Date`). Pass nothing for string or number columns.
 */
export function keysetWhere<Field extends string>(
  sortField: Field,
  cursor: Cursor | undefined,
  direction: SortDirection,
  revive: (value: string | number) => unknown = (value) => value,
): Record<string, unknown> {
  if (!cursor) return {};
  const op = direction === 'asc' ? 'gt' : 'lt';
  const value = revive(cursor.sortKey);
  return {
    OR: [
      { [sortField]: { [op]: value } },
      { [sortField]: value, id: { [op]: cursor.id } },
    ],
  };
}

/** The matching `orderBy`: sort field first, `id` as tie-breaker, same direction. */
export function keysetOrderBy<Field extends string>(
  sortField: Field,
  direction: SortDirection,
): [Record<Field, SortDirection>, { id: SortDirection }] {
  return [
    { [sortField]: direction } as Record<Field, SortDirection>,
    { id: direction },
  ];
}
