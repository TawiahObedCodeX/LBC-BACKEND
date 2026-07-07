/**
 * config/redis.js
 * ──────────────────────────────────────────────────────────
 * One shared Redis connection for the whole app.
 *
 * Redis wears three hats in this project (see README):
 *   1. Caching hot public data (e.g. the events list).
 *   2. Backing BullMQ's background job queue (emails, incl. OTPs).
 *   3. OTP hot-storage — codes are written here with a native
 *      TTL (`EX`) so they expire automatically with no cron job.
 *
 * We use `ioredis` because BullMQ requires it, and it also gives
 * us a clean Promise-based API for the cache and OTP use cases.
 */

const Redis = require('ioredis');
const env = require('./env');
const logger = require('./logger');

const redis = new Redis(env.redisUrl, {
  // BullMQ needs this so blocking commands don't fight with retry logic.
  maxRetriesPerRequest: null,
  // Don't crash the whole app if Redis briefly hiccups — retry with backoff.
  retryStrategy(times) {
    const delay = Math.min(times * 200, 5000);
    return delay;
  },
});

redis.on('connect', () => logger.info('✅ Redis connected'));
redis.on('error', (err) => logger.error({ err }, '❌ Redis connection error'));

/**
 * A second, separate connection is recommended for BullMQ workers/queues
 * (BullMQ puts connections into blocking mode internally, which can
 * conflict with using the same connection for simple GET/SET calls).
 * We export a factory so `emails/email.queue.js` and `email.worker.js`
 * can each create their own dedicated connection when they need one.
 */
function createRedisConnection() {
  return new Redis(env.redisUrl, { maxRetriesPerRequest: null });
}

module.exports = { redis, createRedisConnection };