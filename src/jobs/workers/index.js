/**
 * src/jobs/workers/index.js
 * ──────────────────────────────────────────────────────────────
 * WHAT THIS FILE DOES
 * This is the entry point for the background worker PROCESS.
 * It's run separately from the API:
 *
 *   yarn worker   → runs `node src/jobs/workers/index.js`
 *
 * WHY A SEPARATE ENTRY POINT?
 * The worker needs its own Node.js process so it can run
 * independently of the API. You can:
 *   - Start/stop/restart the worker without touching the API
 *   - Scale the worker separately (run 3 worker instances if
 *     email volume grows, while keeping 2 API instances)
 *   - Monitor its memory/CPU independently
 *
 * This file:
 *   1. Connects to the database and Redis (same as server.js)
 *   2. Creates the email worker (which starts listening for jobs)
 *   3. Listens for shutdown signals to close everything cleanly
 * ──────────────────────────────────────────────────────────────
 */

const { connectDatabase, disconnectDatabase } = require('../../config/db');
const { connectRedis, disconnectRedis } = require('../../config/redis');
const logger = require('../../config/logger');
const { createEmailWorker } = require('./email.worker');

let worker;

async function startWorker() {
  try {
    logger.info('Starting email worker process…');

    // Connect to dependencies — same fail-fast pattern as server.js.
    await connectDatabase();
    await connectRedis();

    // Create and start the worker. It begins polling the queue
    // immediately for any pending jobs.
    worker = createEmailWorker();

    logger.info('✅ Email worker is running and waiting for jobs');
    logger.info('   (Leave this terminal open — the worker must stay running)');
  } catch (err) {
    logger.error({ err }, '❌ Failed to start worker process');
    process.exit(1);
  }
}

/**
 * Graceful shutdown — lets the worker finish its current job
 * before closing, so we never kill a half-sent email.
 */
async function shutdown(signal) {
  logger.info(`${signal} received. Shutting down worker gracefully…`);

  if (worker) {
    // worker.close() waits for the current job to finish, then
    // stops polling for new jobs.
    await worker.close();
    logger.info('Worker closed — current job finished');
  }

  await disconnectDatabase();
  await disconnectRedis();

  logger.info('Worker shutdown complete. Goodbye 👋');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (err) => {
  logger.error({ err }, 'Unhandled promise rejection in worker');
});

startWorker();