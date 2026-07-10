/**
 * prisma/seed.js
 * ──────────────────────────────────────────────────────────────
 * Run via `yarn seed`. Right now there's nothing to seed except a
 * HealthCheck row, so this just proves the Prisma connection works
 * end-to-end. Replace/extend this once the AdminUser model exists
 * (see auth module) to seed a default admin account.
 * ──────────────────────────────────────────────────────────────
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const check = await prisma.healthCheck.create({ data: {} });
  console.log('✅ Seed complete — created HealthCheck row:', check);
}

main()
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });