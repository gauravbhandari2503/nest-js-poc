import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { envSchema } from '../src/config/env.validation.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { runSeed } from './seed/run.js';

// Run with `pnpm prisma db seed`. Needs DATABASE_URL, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD.
const env = envSchema
  .pick({
    DATABASE_URL: true,
    SEED_ADMIN_EMAIL: true,
    SEED_ADMIN_PASSWORD: true,
  })
  .required()
  .parse(process.env);

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});

try {
  await runSeed(prisma, {
    adminEmail: env.SEED_ADMIN_EMAIL,
    adminPassword: env.SEED_ADMIN_PASSWORD,
  });
  console.log('Seed complete');
} finally {
  await prisma.$disconnect();
}
