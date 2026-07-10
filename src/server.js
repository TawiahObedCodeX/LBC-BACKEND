/**
 * src/server.js
 * ──────────────────────────────────────────────────────────────
 * WHAT THIS FILE DOES — this is the file you actually run.
 * (`yarn dev` / `yarn start` both point here.)
 *
 * It does four things, in this exact order, and explains why the
 * order matters:
 *   1. Connect to PostgreSQL   — fail fast if the database is down
 *   2. Connect to Redis         — fail fast if Redis is down
 *   3. Start the HTTP server    — only AFTER dependencies are confirmed
 *   4. Listen for shutdown signals — close everything cleanly
 *
 * WHY CHECK DATABASE/REDIS *BEFORE* ACCEPTING TRAFFIC?
 * If the server started listening immediately and the database
 * happened to be down, the very first user request would fail with
 * a confusing 500 error. By connecting first and only then calling
 * `app.listen()`, a misconfigured `.env` or a database that hasn't
 * started yet shows up immediately, in the terminal, in plain
 * English — not later, buried in a random request's error log.
 * ──────────────────────────────────────────────────────────────
 */

const app = require('./app');
const env = require('./config/env');
const logger = require('./config/logger');
const { connectDatabase, disconnectDatabase } = require('./config/db');
const { connectRedis, disconnectRedis } = require('./config/redis');

let httpServer;

async function startServer() {
  try {
    logger.info('Starting Church Backend API…');

    // Step 1 — Database. If this throws, we never reach step 2 or 3,
    // and the process exits below with a clear error message.
    await connectDatabase();

    // Step 2 — Redis.
    await connectRedis();

    // Step 3 — Only now do we start accepting real traffic.
    httpServer = app.listen(env.PORT, () => {
      logger.info(`✅ Server listening on http://localhost:${env.PORT}`);
      logger.info(`✅ Environment: ${env.NODE_ENV}`);
      logger.info(`👉 Try it: curl http://localhost:${env.PORT}/api/v1/health`);
    });
  } catch (err) {
    // If we can't connect to something the app fundamentally needs,
    // there's no safe way to keep running — log clearly and exit.
    logger.error({ err }, '❌ Failed to start server');
    process.exit(1);
  }
}

/**
 * Step 4 — Graceful shutdown.
 *
 * When you stop the server (Ctrl+C locally, or your hosting
 * provider redeploying/restarting the container), Node receives a
 * signal like SIGTERM or SIGINT. Without handling it, the process
 * dies immediately — potentially mid-database-query, or mid-payment
 * webhook processing.
 *
 * This handler instead:
 *   1. Stops accepting NEW connections
 *   2. Lets in-flight requests finish
 *   3. Closes the database and Redis connections cleanly
 *   4. Only then exits
 */
async function shutdown(signal) {
  logger.info(`${signal} received. Shutting down gracefully…`);

  if (httpServer) {
    httpServer.close(async () => {
      logger.info('HTTP server closed — no longer accepting connections');
      await disconnectDatabase();
      await disconnectRedis();
      logger.info('Shutdown complete. Goodbye 👋');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }

  // Safety net: if something hangs and shutdown takes too long,
  // force-exit after 10 seconds instead of hanging forever.
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Catch anything that slips through try/catch blocks anywhere in the
// app, so it's logged clearly instead of the process crashing silently.
process.on('unhandledRejection', (err) => {
  logger.error({ err }, 'Unhandled promise rejection');
});

startServer();
