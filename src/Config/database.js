/**
 * config/database.js
 * ──────────────────────────────────────────────────────────
 * One shared Prisma Client instance for the whole app.
 *
 * Why a singleton:
 *  - Prisma manages its own connection pool internally. Creating
 *    a `new PrismaClient()` in every file would open a separate
 *    pool per file — wasteful and a common source of "too many
 *    connections" errors in production.
 *  - Every module (`auth`, `members`, `payments`, ...) should
 *    `require('../../config/database')` and get the SAME client.
 *
 * Note: this file does not create your tables — that's what
 * `prisma/schema.prisma` + `yarn prisma:migrate` are for (see
 * the README section "Database Tooling: Prisma vs pgAdmin").
 */

const { PrismaClient } = require('@prisma/client');
const env = require('./env');
const logger = require('./logger');

// In development, `node --watch` / nodemon can re-run this file on every
// save, which would otherwise create a fresh PrismaClient (and a fresh
// connection pool) on every reload. Stashing it on `global` avoids that.
const globalForPrisma = global;

const prisma =
  globalForPrisma.__prisma ||
  new PrismaClient({
    // Pino already logs HTTP requests; here we only want Prisma's
    // warnings and errors, not a copy of every query, to keep logs readable.
    log: env.isProduction ? ['warn', 'error'] : ['warn', 'error'],
  });

if (!env.isProduction) {
  globalForPrisma.__prisma = prisma;
}

/**
 * Call once at server startup to fail fast if the database is
 * unreachable, rather than discovering it on the first request.
 */
async function connectDatabase() {
  await prisma.$connect();
  logger.info('✅ PostgreSQL connected (via Prisma)');
}

/**
 * Call during graceful shutdown so in-flight queries finish
 * and the connection pool closes cleanly.
 */
async function disconnectDatabase() {
  await prisma.$disconnect();
  logger.info('PostgreSQL connection closed');
}

module.exports = { prisma, connectDatabase, disconnectDatabase };