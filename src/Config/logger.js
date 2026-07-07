/**
 * config/logger.js
 * ──────────────────────────────────────────────────────────
 * One structured logger for the whole app (Pino).
 *
 * Why Pino:
 *  - Extremely fast (important since we log on every request).
 *  - Outputs JSON in production, which is what log platforms
 *    (Datadog, CloudWatch, etc.) expect.
 *  - Outputs human-readable colored logs in development via
 *    `pino-pretty`, so you're not staring at raw JSON locally.
 *
 * Usage anywhere in the app:
 *   const logger = require('../config/logger');
 *   logger.info({ userId }, 'User logged in');
 *   logger.error({ err }, 'Payment webhook failed');
 */

const pino = require('pino');
const env = require('./env');

const logger = pino({
  level: env.isProduction ? 'info' : 'debug',

  // Pretty-print in development only. In production we want raw JSON.
  transport: env.isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      },

  // Never accidentally log secrets. Any log call that includes these
  // keys (e.g. logger.info({ password, code }, '...')) gets them redacted.
  redact: {
    paths: [
      'password',
      'code',
      'otp',
      'token',
      'accessToken',
      'refreshToken',
      'loginChallengeToken',
      '*.password',
      '*.code',
      'req.headers.authorization',
      'req.headers.cookie',
    ],
    censor: '[REDACTED]',
  },
});

module.exports = logger;