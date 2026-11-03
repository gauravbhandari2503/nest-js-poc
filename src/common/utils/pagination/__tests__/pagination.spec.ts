import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DomainError } from '../../../errors/domain-error.js';
import { dateSortKey, decodeCursor, encodeCursor } from '../cursor.js';
import { keysetOrderBy, keysetWhere } from '../keyset.js';
import { buildPage, MAX_PAGE_SIZE, pageQueryLimit } from '../page.js';
import { PaginationQueryDto } from '../../../dto/pagination-query.dto.js';

describe('cursor', () => {
  it('round-trips and is opaque', () => {
    const cursor = {
      sortKey: dateSortKey(new Date('2026-11-02T14:00:00Z')),
      id: 'abc',
    };
    const encoded = encodeCursor(cursor);
    expect(decodeCursor(encoded)).toEqual(cursor);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encoded).not.toContain('abc');
  });

  it.each([
    '',
    '%%%',
    'bm90LWpzb24',
    Buffer.from('{"c":{},"i":1}').toString('base64url'),
  ])('rejects the malformed cursor %j with a 422', (value) => {
    expect(() => decodeCursor(value)).toThrow(DomainError);
    try {
      decodeCursor(value);
    } catch (error) {
      expect(error).toMatchObject({ code: 'VALIDATION_FAILED', status: 422 });
    }
  });
});

describe('buildPage', () => {
  const rows = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `id${i}`, at: i }));
  const toCursor = (row: { id: string; at: number }) => ({
    sortKey: row.at,
    id: row.id,
  });

  it('fetches one extra row to detect another page', () => {
    expect(pageQueryLimit(20)).toBe(21);
  });

  it('returns a cursor to the last visible row when more rows exist', () => {
    const page = buildPage(rows(4), 3, toCursor);
    expect(page.items).toHaveLength(3);
    expect(page.page.hasMore).toBe(true);
    expect(decodeCursor(page.page.nextCursor!)).toEqual({
      sortKey: 2,
      id: 'id2',
    });
  });

  it('has no cursor on the last page, exactly full or not', () => {
    expect(buildPage(rows(3), 3, toCursor).page).toEqual({
      nextCursor: null,
      hasMore: false,
    });
    expect(buildPage(rows(2), 3, toCursor).page).toEqual({
      nextCursor: null,
      hasMore: false,
    });
    expect(buildPage([], 3, toCursor)).toEqual({
      items: [],
      page: { nextCursor: null, hasMore: false },
    });
  });
});

describe('keyset', () => {
  it('adds no condition on the first page', () => {
    expect(keysetWhere('createdAt', undefined, 'desc')).toEqual({});
  });

  it('builds a (sortKey, id) comparison for descending order', () => {
    expect(keysetWhere('createdAt', { sortKey: 5, id: 'x' }, 'desc')).toEqual({
      OR: [{ createdAt: { lt: 5 } }, { createdAt: 5, id: { lt: 'x' } }],
    });
  });

  it('uses gt for ascending and revives stored values', () => {
    const where = keysetWhere(
      'startsAt',
      { sortKey: '2026-01-01T00:00:00.000Z', id: 'x' },
      'asc',
      (v) => new Date(v),
    );
    expect(where).toEqual({
      OR: [
        { startsAt: { gt: new Date('2026-01-01T00:00:00.000Z') } },
        { startsAt: new Date('2026-01-01T00:00:00.000Z'), id: { gt: 'x' } },
      ],
    });
  });

  it('orders by the sort field then id, in the same direction', () => {
    expect(keysetOrderBy('createdAt', 'desc')).toEqual([
      { createdAt: 'desc' },
      { id: 'desc' },
    ]);
  });
});

describe('PaginationQueryDto', () => {
  const parse = (query: object) => plainToInstance(PaginationQueryDto, query);

  it('defaults to 20', async () => {
    const dto = parse({});
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.limit).toBe(20);
    expect(dto.decodedCursor()).toBeUndefined();
  });

  it('converts a query-string limit and accepts the maximum', async () => {
    const dto = parse({ limit: String(MAX_PAGE_SIZE) });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.limit).toBe(100);
  });

  it.each(['0', '101', '-1', 'abc', '2.5'])(
    'rejects limit=%s',
    async (limit) => {
      expect((await validate(parse({ limit }))).length).toBeGreaterThan(0);
    },
  );
});
