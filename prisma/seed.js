/**
 * prisma/seed.js
 * ──────────────────────────────────────────────────────────────
 * Run with `yarn seed`. This is where you'll create a default admin
 * account and any other starter data once the AdminUser/Payment/
 * Subscriber models exist. Left intentionally empty for now — it's
 * here so the script exists and exits cleanly rather than erroring
 * with "file not found."
 * ──────────────────────────────────────────────────────────────
 */

const prisma = require('../src/config/db');
const logger = require('../src/config/logger');

async function main() {
  logger.info('No seed data defined yet — add admin/payment/subscriber seeding here.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    logger.error({ err }, 'Seed failed');
    await prisma.$disconnect();
    process.exit(1);
  });
