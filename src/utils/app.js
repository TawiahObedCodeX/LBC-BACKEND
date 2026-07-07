const express = require('express');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const pinoHttp = require('pino-http');

const env = require('./config/env');
const logger = require('./config/logger');
const applySecurityMiddleware = require('./middleware/security.middleware');
const { generalLimiter } = require('./middleware/rateLimiter.middleware');
const { notFoundHandler, errorHandler } = require('./middleware/error.middleware');
const paymentController = require('./modules/payments/payment.controller');
const apiRoutes = require('./routes');

const app = express();

// Required when running behind a reverse proxy / load balancer (Nginx,
// AWS ALB, Render, Railway) so that req.ip and rate-limiting reflect the
// REAL client IP from the X-Forwarded-For header, not the proxy's IP.
app.set('trust proxy', 1);

// --- Security middleware (helmet, cors, hpp, sanitization, compression) ---
applySecurityMiddleware(app);

// --- Body parsing ---
// We capture the raw request body (req.rawBody) alongside the parsed JSON
// because the Paystack webhook signature must be computed against the
// EXACT raw bytes Paystack sent — not a re-serialized JSON object, which
// can differ in whitespace/key order and break the signature check.
app.use(
  express.json({
    limit: '10kb', // caps payload size — mitigates simple DoS via giant bodies
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser(env.COOKIE_SECRET));

// --- Logging ---
app.use(env.NODE_ENV === 'development' ? morgan('dev') : pinoHttp({ logger }));

// --- Global rate limiting (per-route limiters add extra protection on top) ---
app.use('/api', generalLimiter);

// --- Health check (used by load balancers & Docker healthchecks) ---
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// --- Paystack webhook: mounted BEFORE auth, needs raw body, verified via signature ---
app.post('/api/v1/payments/webhook', paymentController.webhook);

// --- Main API routes ---
app.use('/api/v1', apiRoutes);

// --- 404 + centralized error handler (must be last) ---
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
