const app = require('./app');
const env = require('./config/env');
const logger = require('./config/logger');
const prisma = require('./config/database');
const redis = require('./config/redis');

const server = app.listen(env.PORT, () => {
  logger.info(`🚀 ${env.APP_NAME} running on port ${env.PORT} [${env.NODE_ENV}]`);
});

// Catch programming errors that would otherwise crash the process silently
// or leave it in a corrupted state. We log, then exit — letting the process
// manager (PM2 / Docker / Kubernetes) restart a clean instance.
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, '💥 Unhandled Promise Rejection');
  throw reason;
});

process.on('uncaughtException', (err) => {
  logger.error({ err }, '💥 Uncaught Exception');
  process.exit(1);
});

// Graceful shutdown: when the process manager sends SIGTERM/SIGINT
// (e.g. during a deploy or container restart), stop accepting new
// connections, finish in-flight requests, then close DB/Redis connections
// cleanly. This prevents dropped requests and connection leaks during
// deploys — important once this is running behind a load balancer with
// rolling deployments.
async function shutdown(signal) {
  logger.info(`${signal} received. Shutting down gracefully...`);
  server.close(async () => {
    await prisma.$disconnect();
    redis.disconnect();
    logger.info('✅ Cleanup complete. Goodbye.');
    process.exit(0);
  });

  // Force-exit if shutdown hangs for more than 10s.
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = server;