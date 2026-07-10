/**
 * src/app.js
 * ──────────────────────────────────────────────────────────────
 * WHAT THIS FILE DOES
 * Builds a fully-configured Express application: security headers,
 * CORS, logging, body parsing, rate limiting, routes, and error
 * handling — all wired together in one predictable order.
 *
 * WHY IS THIS SEPARATE FROM server.js?
 * This file NEVER calls `app.listen()`. That's deliberate:
 *   - Tests (see tests/) can `require('./app')` and use Supertest to
 *     send fake requests directly to it, without opening a real
 *     network port.
 *   - server.js is the only file responsible for actually starting
 *     the app and connecting to the database/Redis — see that file
 *     for the startup sequence.
 *
 * MIDDLEWARE ORDER MATTERS. Express runs middleware top-to-bottom,
 * so read this file top-to-bottom to understand what happens to a
 * request, in order, before it reaches your route handler.
 * ──────────────────────────────────────────────────────────────
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const hpp = require('hpp');
const pinoHttp = require('pino-http');

const env = require('./config/env');
const logger = require('./config/logger');
const routes = require('./routes');
const { generalLimiter } = require('./middleware/rateLimit.middleware');
const { notFoundHandler, errorHandler } = require('./middleware/error.middleware');

const app = express();

// ── 1. Security headers ──────────────────────────────────────
// Helmet sets ~15 HTTP headers (X-Frame-Options, HSTS, etc.) that
// protect against a range of common web vulnerabilities. There's
// almost never a reason to skip this, so it goes first.
app.use(helmet());

// ── 2. CORS ───────────────────────────────────────────────────
// Only the Next.js frontend origins listed in .env are allowed to
// call this API from a browser. Anything else gets blocked by the
// browser itself, before a request even reaches your route logic.
app.use(
  cors({
    origin: env.CORS_ALLOWED_ORIGINS,
    credentials: true, // allows the httpOnly refresh cookie to be sent
  }),
);

// ── 3. Compression ────────────────────────────────────────────
// Gzips response bodies. Cheap win for response size/speed,
// especially once you're returning paginated lists of payments or
// subscribers.
app.use(compression());

// ── 4. Request logging ────────────────────────────────────────
// Logs one structured line per request/response (method, path,
// status code, response time). This also attaches `req.log` to
// every request, which routes.js uses for request-scoped logging.
app.use(pinoHttp({ logger }));

// ── 5. Body parsing ────────────────────────────────────────────
// Parses incoming JSON bodies into `req.body`. The size limit stops
// someone from sending a huge payload to exhaust server memory.
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// ── 6. HTTP Parameter Pollution protection ────────────────────
// Prevents a request like `?sort=price&sort=name` from producing
// unexpected array behavior in query parsing.
app.use(hpp());

// ── 7. Rate limiting ───────────────────────────────────────────
// Applied globally here. Stricter, endpoint-specific limits (e.g.
// on /payments/initiate) get layered on top inside that module.
app.use(generalLimiter);

// ── 8. Routes ───────────────────────────────────────────────────
// Every route in this app lives under /api/v1 — see src/routes.js
// for what's actually mounted.
app.use('/api/v1', routes);

// ── 9. 404 + error handling ────────────────────────────────────
// MUST be registered last. notFoundHandler catches any request that
// didn't match a route above; errorHandler catches every error
// thrown or passed to next() anywhere in the app.
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
