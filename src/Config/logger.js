/**
 * src/config/logger.js
 * ──────────────────────────────────────────────────────────────
 * WHAT THIS FILE DOES
 * Creates one shared logger for the whole app, built on Pino.
 *
 * WHY NOT JUST USE console.log?
 * - In production, `console.log` output is just unstructured text.
 *   A real logger outputs structured JSON, one line per log — which
 *   log viewers (Railway, Render, Datadog, CloudWatch) can search,
 *   filter, and alert on (e.g. "show me every 'error' level log
 *   from the payments module in the last hour").
 * - In development, that same JSON is hard for a human to read, so
 *   below we detect the environment and pretty-print it instead.
 *
 * HOW TO USE IT ELSEWHERE IN THE APP
 *   const logger = require('../config/logger');
 *   logger.info('Server started');
 *   logger.error({ err }, 'Payment webhook failed');
 *   logger.warn({ userId }, 'Rate limit hit');
 *
 * Always pass extra context as the FIRST argument (an object), and
 * the human-readable message as the SECOND — that's the convention
 * Pino expects, and it's what makes the JSON output searchable.
 * ──────────────────────────────────────────────────────────────
 */

const pino = require('pino');
const env = require('./env');

const isDevelopment = env.NODE_ENV === 'development';

const logger = pino({
  level: isDevelopment ? 'debug' : 'info',

  // Only pretty-print in development. In production we want raw
  // JSON lines, because that's what log aggregators expect.
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      }
    : undefined,

  // Never accidentally log secrets. Any log object with these keys
  // gets the value replaced with "[Redacted]" automatically.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'token',
      'accessToken',
      'refreshToken',
    ],
    censor: '[Redacted]',
  },
});

module.exports = logger;
