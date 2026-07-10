/**
 * src/config/redis.js
 * ──────────────────────────────────────────────────────────────
 * WHAT THIS FILE DOES
 * Creates ONE shared Redis client for the whole app (same singleton
 * reasoning as db.js — one connection pool, reused everywhere).
 *
 * Redis is used for three things in this project:
 *   1. Caching cheap-to-serve public data (e.g. subscriber counts)
 *   2. Backing the BullMQ background job queue (newsletters, receipts)
 *   3. Backing rate limiting (so limits are shared across every API
 *      instance, not just tracked in one instance's memory)
 *
 * HOW TO USE IT ELSEWHERE IN THE APP
 *   const redis = require('../config/redis');
 *   await redis.set('key', 'value', 'EX', 60); // expires in 60s
 *   const value = await redis.get('key');
 * ──────────────────────────────────────────────────────────────
 */

const Redis = require('ioredis');
const logger = require('./logger');
const env = require('./env');

const redis = new Redis(env.REDIS_URL, {
  // If Redis is briefly unreachable (e.g. restarting), retry with
  // increasing delay instead of giving up immediately. Capped at
  // 2 seconds so we're never stuck waiting too long between tries.
  retryStrategy(attempt) {
    const delayMs = Math.min(attempt * 200, 2000);
    return delayMs;
  },

  // Queue commands in memory while reconnecting instead of throwing
  // immediately — smooths over brief network blips.
  maxRetriesPerRequest: null,
});

// These event listeners are what make Redis issues visible in your
// logs instead of failing silently or crashing with a cryptic error
// three files away from where the actual problem is.
redis.on('connect', () => logger.info('✅ Redis connected'));
redis.on('error', (err) => logger.error({ err }, '❌ Redis connection error'));
redis.on('reconnecting', () => logger.warn('Redis reconnecting…'));

/**
 * Call this once on server startup to confirm Redis is reachable
 * before the app starts accepting traffic — same fail-fast idea as
 * connectDatabase() in db.js.
 */
async function connectRedis() {
  // ioredis connects lazily by default in some configs, but with the
  // options above it connects eagerly. `ping` is a cheap way to
  // actively confirm the connection is alive rather than assuming.
  await redis.ping();
}

/**
 * Call this during graceful shutdown so Redis connections close
 * cleanly instead of being killed mid-command.
 */
async function disconnectRedis() {
  await redis.quit();
  logger.info('Redis connection closed');
}

module.exports = redis;
module.exports.connectRedis = connectRedis;
module.exports.disconnectRedis = disconnectRedis;
