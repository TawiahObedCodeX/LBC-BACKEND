/**
 * src/config/db.js
 * ──────────────────────────────────────────────────────────────
 * WHAT THIS FILE DOES
 * Creates ONE shared Prisma Client instance for the whole app and
 * exposes small helper functions to connect/disconnect it cleanly.
 *
 * WHY A SINGLETON (only one instance, reused everywhere)?
 * Every `new PrismaClient()` opens its own pool of database
 * connections. If every file that needed the database created its
 * own client, you'd quickly exhaust Postgres's connection limit.
 * By creating it once here and importing it everywhere else, the
 * whole app shares one small, well-managed connection pool.
 *
 * HOW TO USE IT ELSEWHERE IN THE APP
 *   const prisma = require('../config/db');
 *   const payments = await prisma.payment.findMany();
 * ──────────────────────────────────────────────────────────────
 */

const { PrismaClient } = require('@prisma/client');
const logger = require('./logger');
const env = require('./env');

// `log` controls what Prisma itself logs. In development we want to
// see the actual SQL queries it runs — invaluable for debugging a
// slow or wrong query. In production that's just noise (and a minor
// performance cost), so we only log warnings and errors.
const prisma = new PrismaClient({
  log:
    env.NODE_ENV === 'development'
      ? [
          { emit: 'event', level: 'query' },
          { emit: 'event', level: 'warn' },
          { emit: 'event', level: 'error' },
        ]
      : [
          { emit: 'event', level: 'warn' },
          { emit: 'event', level: 'error' },
        ],
});

if (env.NODE_ENV === 'development') {
  // `$on('query', ...)` fires for every SQL statement Prisma runs.
  // We pipe it into our own structured logger so it shows up
  // alongside every other log line, instead of Prisma printing to
  // the console in its own separate format.
  prisma.$on('query', (event) => {
    logger.debug({ query: event.query, durationMs: event.duration }, 'Prisma query');
  });
}

prisma.$on('warn', (event) => logger.warn(event, 'Prisma warning'));
prisma.$on('error', (event) => logger.error(event, 'Prisma error'));

/**
 * Call this once, on server startup, to verify the database is
 * actually reachable BEFORE the app starts accepting traffic.
 * Failing fast here is much easier to debug than discovering the
 * database is unreachable on the very first request from a user.
 */
async function connectDatabase() {
  await prisma.$connect();
  logger.info('✅ PostgreSQL connected');
}

/**
 * Call this during graceful shutdown so in-flight queries are
 * allowed to finish and the connection pool closes cleanly instead
 * of being killed mid-query.
 */
async function disconnectDatabase() {
  await prisma.$disconnect();
  logger.info('PostgreSQL connection closed');
}

module.exports = prisma;
module.exports.connectDatabase = connectDatabase;
module.exports.disconnectDatabase = disconnectDatabase;
