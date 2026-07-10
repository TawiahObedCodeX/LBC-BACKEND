/**
 * src/jobs/workers/index.js
 * ──────────────────────────────────────────────────────────────
 * Run with `yarn worker`. This process is SEPARATE from the API
 * (src/server.js) — it's what actually sends newsletters and
 * payment receipts, pulled off the Redis/BullMQ queue, so the API
 * never blocks on SMTP.
 *
 * This is a placeholder until the newsletter module is built. Once
 * it exists, this file will import and start the BullMQ Worker(s)
 * defined in src/jobs/workers/email.worker.js.
 * ──────────────────────────────────────────────────────────────
 */

const logger = require('../../config/logger');
const { connectRedis } = require('../../config/redis');

async function startWorker() {
  await connectRedis();
  logger.info('✅ Worker connected to Redis — waiting for jobs (none registered yet)');
  // require('./email.worker'); // ← uncomment once the newsletter module exists
}

startWorker();
