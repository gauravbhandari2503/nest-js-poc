import type { PrismaClient } from '../../src/generated/prisma/client.js';
import {
  claimSeats,
  createBooking,
  createCompany,
  createMovie,
  createShow,
  createTestPrisma,
  createUser,
  createVenue,
  minutes,
  uid,
} from './helpers.js';

// Each constraint below is part of the database design (database-design.md section 6).
// They run against the real test database: a mocked DB would prove nothing here.
describe('database constraints', () => {
  let prisma: PrismaClient;
  let admin: { id: string };

  beforeAll(async () => {
    prisma = createTestPrisma();
    admin = await createUser(prisma, 'SUPER_ADMIN');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('composite tenant foreign keys', () => {
    it('rejects a screen whose company differs from its theater company', async () => {
      const venue = await createVenue(prisma, admin.id, 0);
      const other = await createCompany(prisma, admin.id);

      await expect(
        prisma.screen.create({
          data: {
            companyId: other.id,
            theaterId: venue.theater.id,
            name: 'Cross tenant',
          },
        }),
      ).rejects.toThrow();
    });

    it('rejects a seat that mixes a screen and a seat category from different companies', async () => {
      const a = await createVenue(prisma, admin.id, 0);
      const b = await createVenue(prisma, admin.id, 0);

      await expect(
        prisma.seat.create({
          data: {
            companyId: a.company.id,
            screenId: a.screen.id,
            seatCategoryId: b.category.id,
            rowLabel: 'Z',
            seatNumber: 1,
            colIndex: 1,
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe('show overlap', () => {
    it('rejects overlapping shows, allows back-to-back, and cancelled shows free the slot', async () => {
      const venue = await createVenue(prisma, admin.id, 0);
      const movie = await createMovie(prisma);
      const t0 = new Date('2030-01-01T10:00:00Z');

      await createShow(prisma, venue, movie.id, t0, minutes(t0, 120));

      await expect(
        createShow(prisma, venue, movie.id, minutes(t0, 60), minutes(t0, 180)),
      ).rejects.toThrow();

      // Starts exactly when the first ends: ranges are half-open, so this is fine.
      await createShow(
        prisma,
        venue,
        movie.id,
        minutes(t0, 120),
        minutes(t0, 240),
      );

      const cancelled = await createShow(
        prisma,
        venue,
        movie.id,
        minutes(t0, 300),
        minutes(t0, 400),
        'CANCELLED',
      );
      await createShow(
        prisma,
        venue,
        movie.id,
        minutes(t0, 300),
        minutes(t0, 400),
      );
      expect(cancelled.status).toBe('CANCELLED');
    });
  });

  describe('customer memberships', () => {
    it('rejects two overlapping active memberships for one customer and company', async () => {
      const venue = await createVenue(prisma, admin.id, 0);
      const customer = await createUser(prisma);
      const plan = await prisma.membershipPlan.create({
        data: {
          name: `Plan ${uid()}`,
          durationDays: 30,
          discountBps: 1000,
          benefits: 'b',
          suggestedPrice: 1000,
        },
      });
      const offer = await prisma.companyMembershipOffer.create({
        data: { companyId: venue.company.id, planId: plan.id, price: 1000 },
      });
      const base = {
        customerId: customer.id,
        companyId: venue.company.id,
        offerId: offer.id,
        status: 'ACTIVE' as const,
        discountBps: 1000,
        pricePaid: 1000,
        taxAmount: 0,
        membershipCommissionBps: 1000,
      };
      const t0 = new Date('2030-01-01T00:00:00Z');

      await prisma.customerMembership.create({
        data: { ...base, startsAt: t0, endsAt: minutes(t0, 60 * 24 * 30) },
      });
      await expect(
        prisma.customerMembership.create({
          data: {
            ...base,
            startsAt: minutes(t0, 60 * 24 * 10),
            endsAt: minutes(t0, 60 * 24 * 40),
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe('ledger', () => {
    async function ledgerFixture() {
      const venue = await createVenue(prisma, admin.id, 0);
      const movie = await createMovie(prisma);
      const t0 = new Date('2031-01-01T10:00:00Z');
      const show = await createShow(
        prisma,
        venue,
        movie.id,
        t0,
        minutes(t0, 120),
      );
      const customer = await createUser(prisma);
      const booking = await createBooking(
        prisma,
        venue.company.id,
        show.id,
        customer.id,
      );
      const entry = await prisma.ledgerEntry.create({
        data: {
          account: 'COMPANY_PAYABLE',
          companyId: venue.company.id,
          entryType: 'TICKET_PAYOUT',
          amount: 900,
          bookingId: booking.id,
        },
      });
      return { venue, booking, entry };
    }

    it('blocks UPDATE and DELETE on ledger entries', async () => {
      const { entry } = await ledgerFixture();

      await expect(
        prisma.ledgerEntry.update({
          where: { id: entry.id },
          data: { amount: 1 },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.ledgerEntry.delete({ where: { id: entry.id } }),
      ).rejects.toThrow();

      // The trigger raises restrict_violation, which Prisma reports as a generic FK error,
      // so also prove the row is untouched.
      const row = await prisma.ledgerEntry.findUniqueOrThrow({
        where: { id: entry.id },
      });
      expect(row.amount).toBe(900);
    });

    it('recognising the same booking and entry type twice is rejected', async () => {
      const { venue, booking } = await ledgerFixture();

      await expect(
        prisma.ledgerEntry.create({
          data: {
            account: 'COMPANY_PAYABLE',
            companyId: venue.company.id,
            entryType: 'TICKET_PAYOUT',
            amount: 900,
            bookingId: booking.id,
          },
        }),
      ).rejects.toThrow();
    });

    it('requires a memo on ADJUSTMENT entries', async () => {
      const venue = await createVenue(prisma, admin.id, 0);

      await expect(
        prisma.ledgerEntry.create({
          data: {
            account: 'COMPANY_PAYABLE',
            companyId: venue.company.id,
            entryType: 'ADJUSTMENT',
            amount: 100,
          },
        }),
      ).rejects.toThrow();
    });

    it('reports the payable balance through the view', async () => {
      const { venue } = await ledgerFixture();

      const rows = await prisma.$queryRaw<{ balance: bigint }[]>`
        SELECT balance FROM company_payable_balances WHERE company_id = ${venue.company.id}::uuid`;
      expect(Number(rows[0]?.balance)).toBe(900);
    });
  });

  describe('seat claims', () => {
    async function showFixture(seatCount: number) {
      const venue = await createVenue(prisma, admin.id, seatCount);
      const movie = await createMovie(prisma);
      const t0 = new Date('2032-01-01T10:00:00Z');
      const show = await createShow(
        prisma,
        venue,
        movie.id,
        t0,
        minutes(t0, 120),
      );
      return { venue, show };
    }

    it('20 parallel claims on one seat produce exactly one winner', async () => {
      const { venue, show } = await showFixture(1);
      const seatId = venue.seats[0]!.id;
      const heldUntil = new Date(Date.now() + 10 * 60_000);

      const bookings = await Promise.all(
        Array.from({ length: 20 }, async () => {
          const customer = await createUser(prisma);
          return createBooking(
            prisma,
            venue.company.id,
            show.id,
            customer.id,
            heldUntil,
          );
        }),
      );

      const results = await Promise.all(
        bookings.map((b) =>
          claimSeats(prisma, {
            bookingId: b.id,
            showId: show.id,
            seatIds: [seatId],
            seatCategoryId: venue.category.id,
            heldUntil,
          }),
        ),
      );

      const winners = results.filter((missing) => missing.length === 0);
      expect(winners).toHaveLength(1);
      expect(
        await prisma.bookingSeat.count({
          where: { showId: show.id, seatId, status: 'HELD' },
        }),
      ).toBe(1);
    });

    it('releases an expired hold and re-claims the seat in one transaction', async () => {
      const { venue, show } = await showFixture(1);
      const seatId = venue.seats[0]!.id;
      const [c1, c2] = [await createUser(prisma), await createUser(prisma)];
      const expired = new Date(Date.now() - 60_000);
      const live = new Date(Date.now() + 10 * 60_000);
      const first = await createBooking(
        prisma,
        venue.company.id,
        show.id,
        c1.id,
        expired,
      );
      const second = await createBooking(
        prisma,
        venue.company.id,
        show.id,
        c2.id,
        live,
      );

      const args = {
        showId: show.id,
        seatIds: [seatId],
        seatCategoryId: venue.category.id,
      };
      expect(
        await claimSeats(prisma, {
          ...args,
          bookingId: first.id,
          heldUntil: expired,
        }),
      ).toEqual([]);
      expect(
        await claimSeats(prisma, {
          ...args,
          bookingId: second.id,
          heldUntil: live,
        }),
      ).toEqual([]);

      const rows = await prisma.bookingSeat.findMany({
        where: { showId: show.id, seatId },
      });
      expect(rows.map((r) => r.status).sort()).toEqual(['HELD', 'RELEASED']);
    });

    it('never releases a live hold', async () => {
      const { venue, show } = await showFixture(1);
      const seatId = venue.seats[0]!.id;
      const [c1, c2] = [await createUser(prisma), await createUser(prisma)];
      const live = new Date(Date.now() + 10 * 60_000);
      const first = await createBooking(
        prisma,
        venue.company.id,
        show.id,
        c1.id,
        live,
      );
      const second = await createBooking(
        prisma,
        venue.company.id,
        show.id,
        c2.id,
        live,
      );

      const args = {
        showId: show.id,
        seatIds: [seatId],
        seatCategoryId: venue.category.id,
        heldUntil: live,
      };
      await claimSeats(prisma, { ...args, bookingId: first.id });

      expect(
        await claimSeats(prisma, { ...args, bookingId: second.id }),
      ).toEqual([seatId]);
    });
  });
});
