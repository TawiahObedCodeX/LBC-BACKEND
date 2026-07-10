/**
 * src/middleware/rateLimit.middleware.js
 * ──────────────────────────────────────────────────────────────
 * WHAT THIS FILE DOES
 * Limits how many requests a single IP address can make in a given
 * time window, to protect the API from abuse (accidental or
 * malicious) — e.g. a script hammering /payments/initiate.
 *
 * WHY REDIS-BACKED, NOT THE DEFAULT IN-MEMORY STORE?
 * express-rate-limit's default store keeps counts in the memory of
 * ONE running process. Once you run more than one API instance
 * behind Nginx (see the README's scaling section), each instance
 * would track limits separately — someone could get 100 requests
 * per instance instead of 100 total. Storing counts in Redis means
 * every instance shares the same count, so the limit is real no
 * matter how many instances are running.
 * ──────────────────────────────────────────────────────────────
 */

const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const redis = require('../config/redis');
const env = require('../config/env');

/**
 * General-purpose limiter — applied to the whole API in app.js.
 * Generous enough not to bother a normal visitor, tight enough to
 * blunt a scripted abuse attempt.
 */
const generalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true, // return rate-limit info in RateLimit-* headers
  legacyHeaders: false,
  store: new RedisStore({
    // rate-limit-redis expects a `sendCommand` function; ioredis's
    // `.call()` matches that shape directly.
    sendCommand: (...args) => redis.call(...args),
    prefix: 'rate-limit:general:',
  }),
  message: {
    success: false,
    message: 'Too many requests. Please try again shortly.',
    data: null,
  },
});

/**
 * A stricter limiter for sensitive endpoints (auth, payment
 * initiation). Import and apply this directly on top of a specific
 * route when you build the payments/auth modules, e.g.:
 *   router.post('/login', strictLimiter, authController.login);
 */
const strictLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args) => redis.call(...args),
    prefix: 'rate-limit:strict:',
  }),
  message: {
    success: false,
    message: 'Too many attempts. Please wait before trying again.',
    data: null,
  },
});

module.exports = { generalLimiter, strictLimiter };
