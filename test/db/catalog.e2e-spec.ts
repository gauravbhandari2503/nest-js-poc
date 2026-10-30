import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestPrisma } from './helpers.js';

// Prisma cannot express these objects, so `prisma migrate dev` will not notice if one is
// dropped or renamed by mistake. This test fails loudly instead.
const EXTENSIONS = ['citext', 'btree_gist', 'pg_trgm'];

const INDEXES = [
  'booking_seats_one_active_per_show_seat',
  'bookings_one_pending_per_customer_show',
  'refund_requests_one_open_per_booking',
  'company_staff_one_owner_per_company',
  'roles_company_name_key',
  'roles_system_name_key',
  'ledger_entries_booking_entry_type_key',
  'ledger_entries_membership_entry_type_key',
  'worker_assignments_one_active',
  'screens_theater_name_active_key',
  'shows_movie_scheduled_idx',
  'shows_ends_at_scheduled_idx',
  'booking_seats_held_until_idx',
  'bookings_unrecognised_idx',
  'customer_memberships_active_lookup_idx',
  'ledger_entries_balance_idx',
  'outbox_events_pending_idx',
  'movies_genres_gin_idx',
  'movies_title_trgm_idx',
];

const CONSTRAINTS = [
  'shows_no_overlap',
  'customer_memberships_no_overlap',
  'companies_sales_commission_bps_range',
  'companies_membership_commission_bps_range',
  'shows_ends_after_start',
  'bookings_total_nonneg',
  'bookings_total_ok',
  'bookings_refund_le_paid',
  'bookings_bps_range',
  'booking_food_lines_quantity_positive',
  'payments_amount_positive',
  'payments_kind_matches_fk',
  'refunds_amount_positive',
  'settlements_amount_positive',
  'settlements_period_ok',
  'ledger_adjustment_has_memo',
  'customer_memberships_active_has_dates',
  'screens_company_id_theater_id_fkey',
  'seats_company_id_screen_id_fkey',
  'seats_company_id_seat_category_id_fkey',
  'shows_company_id_screen_id_fkey',
  'bookings_company_id_show_id_fkey',
];

const TRIGGERS = [
  'ledger_entries_immutable',
  'audit_logs_immutable',
  'refunds_no_delete',
];

describe('hand-written database objects', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createTestPrisma();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const missing = (expected: string[], actual: string[]) =>
    expected.filter((name) => !actual.includes(name));

  it('has the extensions', async () => {
    const rows = await prisma.$queryRaw<{ name: string }[]>`
      SELECT extname AS name FROM pg_extension`;
    expect(
      missing(
        EXTENSIONS,
        rows.map((r) => r.name),
      ),
    ).toEqual([]);
  });

  it('has the partial, covering and GIN indexes', async () => {
    const rows = await prisma.$queryRaw<{ name: string }[]>`
      SELECT indexname AS name FROM pg_indexes WHERE schemaname = 'public'`;
    expect(
      missing(
        INDEXES,
        rows.map((r) => r.name),
      ),
    ).toEqual([]);
  });

  it('has the exclusion, check and composite foreign key constraints', async () => {
    const rows = await prisma.$queryRaw<{ name: string }[]>`
      SELECT conname AS name FROM pg_constraint`;
    expect(
      missing(
        CONSTRAINTS,
        rows.map((r) => r.name),
      ),
    ).toEqual([]);
  });

  it('has the append-only triggers', async () => {
    const rows = await prisma.$queryRaw<{ name: string }[]>`
      SELECT tgname AS name FROM pg_trigger WHERE NOT tgisinternal`;
    expect(
      missing(
        TRIGGERS,
        rows.map((r) => r.name),
      ),
    ).toEqual([]);
  });

  it('has the invoice number function, sequence and payable balance view', async () => {
    const [row] = await prisma.$queryRaw<
      { number: string; view: string | null }[]
    >`
      SELECT next_invoice_number() AS number,
             to_regclass('public.company_payable_balances')::text AS view`;
    expect(row?.number).toMatch(/^INV-\d{4}-\d{6}$/);
    expect(row?.view).toBe('company_payable_balances');
  });
});
