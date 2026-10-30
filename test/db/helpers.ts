import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';

export function createTestPrisma(): PrismaClient {
  const url = process.env['DATABASE_URL'];
  if (!url?.includes('_test')) {
    // Guard: these tests insert and mutate data; never run them against the dev DB.
    throw new Error(`Refusing to run DB tests against ${url}`);
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

/** Unique suffix so test files can share one database without truncating it. */
export const uid = () => randomUUID().slice(0, 8);

export const minutes = (base: Date, n: number) =>
  new Date(base.getTime() + n * 60_000);

export async function createUser(
  prisma: PrismaClient,
  kind: 'SUPER_ADMIN' | 'STAFF' | 'CLIENT' = 'CLIENT',
) {
  return prisma.user.create({
    data: {
      kind,
      email: `${kind.toLowerCase()}-${uid()}@test.local`,
      fullName: 'Test User',
      status: 'ACTIVE',
    },
  });
}

export async function createCompany(prisma: PrismaClient, adminId: string) {
  const id = uid();
  return prisma.company.create({
    data: {
      name: `Company ${id}`,
      slug: `company-${id}`,
      salesCommissionBps: 1000,
      membershipCommissionBps: 1000,
      registrationFee: 0,
      cancellationPolicy: 'none',
      refundPolicy: 'none',
      onboardedBy: adminId,
    },
  });
}

/** One company with a theater, a screen, one seat category and `seatCount` seats. */
export async function createVenue(
  prisma: PrismaClient,
  adminId: string,
  seatCount = 1,
) {
  const company = await createCompany(prisma, adminId);
  const city = await prisma.city.create({
    data: { name: `City ${uid()}`, state: 'Test State' },
  });
  const theater = await prisma.theater.create({
    data: {
      companyId: company.id,
      cityId: city.id,
      name: 'Theater',
      address: 'Street 1',
      pincode: '400001',
    },
  });
  const screen = await prisma.screen.create({
    data: { companyId: company.id, theaterId: theater.id, name: 'Screen 1' },
  });
  const category = await prisma.seatCategory.create({
    data: { companyId: company.id, name: 'Gold' },
  });
  const seats = [];
  for (let i = 1; i <= seatCount; i++) {
    seats.push(
      await prisma.seat.create({
        data: {
          companyId: company.id,
          screenId: screen.id,
          seatCategoryId: category.id,
          rowLabel: 'A',
          seatNumber: i,
          colIndex: i,
        },
      }),
    );
  }
  return { company, theater, screen, category, seats };
}

export async function createMovie(prisma: PrismaClient) {
  return prisma.movie.create({
    data: {
      title: `Movie ${uid()}`,
      description: 'd',
      durationMinutes: 120,
      language: 'English',
      certification: 'U',
      genres: ['Drama'],
      releaseDate: new Date('2026-01-01'),
    },
  });
}

export async function createShow(
  prisma: PrismaClient,
  venue: { company: { id: string }; screen: { id: string } },
  movieId: string,
  startsAt: Date,
  endsAt: Date,
  status: 'SCHEDULED' | 'CANCELLED' = 'SCHEDULED',
) {
  return prisma.show.create({
    data: {
      companyId: venue.company.id,
      screenId: venue.screen.id,
      movieId,
      startsAt,
      endsAt,
      intervalOffsetMinutes: 60,
      intervalDurationMinutes: 15,
      status,
    },
  });
}

export async function createBooking(
  prisma: PrismaClient,
  companyId: string,
  showId: string,
  customerId: string,
  heldUntil = new Date(Date.now() + 10 * 60_000),
) {
  return prisma.booking.create({
    data: {
      reference: `BMT-${uid()}`,
      companyId,
      showId,
      customerId,
      heldUntil,
      commissionBps: 1000,
      seatsSubtotal: 1000,
      totalAmount: 1000,
    },
  });
}

/**
 * The seat-claim algorithm from database-design.md 7.2, as one transaction:
 * insert (conflicts skipped), release expired conflicting holds, retry once.
 * Returns the seat ids that could not be claimed.
 */
export async function claimSeats(
  prisma: PrismaClient,
  args: {
    bookingId: string;
    showId: string;
    seatIds: string[];
    seatCategoryId: string;
    heldUntil: Date;
  },
): Promise<string[]> {
  return prisma.$transaction(async (tx) => {
    const insert = async (seatIds: string[]) => {
      const rows = await tx.$queryRaw<{ seat_id: string }[]>`
        INSERT INTO booking_seats
          (id, booking_id, show_id, seat_id, seat_category_id, status, held_until,
           unit_price, tax_rate_bps, tax_amount, updated_at)
        SELECT gen_random_uuid(), ${args.bookingId}::uuid, ${args.showId}::uuid, s,
               ${args.seatCategoryId}::uuid, 'HELD', ${args.heldUntil}, 1000, 0, 0, now()
        FROM unnest(${seatIds}::uuid[]) AS s
        ON CONFLICT (show_id, seat_id) WHERE status IN ('HELD', 'SOLD') DO NOTHING
        RETURNING seat_id`;
      return rows.map((r) => r.seat_id);
    };

    const claimed = new Set(await insert(args.seatIds));
    let missing = args.seatIds.filter((s) => !claimed.has(s));
    if (missing.length > 0) {
      await tx.$executeRaw`
        UPDATE booking_seats SET status = 'RELEASED', updated_at = now()
        WHERE show_id = ${args.showId}::uuid AND seat_id = ANY(${missing}::uuid[])
          AND status = 'HELD' AND held_until <= now()`;
      for (const s of await insert(missing)) claimed.add(s);
      missing = args.seatIds.filter((s) => !claimed.has(s));
    }
    return missing;
  });
}
