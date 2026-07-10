/**
 * src/middleware/error.middleware.js
 * ──────────────────────────────────────────────────────────────
 * WHAT THIS FILE DOES
 * Express funnels every error — thrown in a route, a service, or
 * passed to `next(err)` — into this ONE handler. That means every
 * error response the API ever sends has the exact same shape, and
 * you only ever have to fix error formatting in one place.
 *
 * A small custom `ApiError` class is included so route/service code
 * can throw errors with a specific HTTP status attached, e.g.:
 *   throw new ApiError(404, 'Payment not found');
 * ──────────────────────────────────────────────────────────────
 */

const logger = require('../config/logger');
const env = require('../config/env');

class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true; // "expected" error (bad input, not found, etc.)
  }
}

/**
 * Handles requests to routes that don't exist. This MUST be
 * registered in app.js AFTER all real routes and BEFORE the error
 * handler below.
 */
function notFoundHandler(req, res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

/**
 * The final error handler. Express recognizes this as an error
 * handler specifically because it takes FOUR arguments (err, req,
 * res, next) — don't remove any of them, even though `next` is
 * unused, or Express will treat it as a normal middleware instead.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const isOperational = err.isOperational || false;

  // Log every error server-side with full detail, regardless of
  // what we choose to show the client.
  logger.error({ err, statusCode, path: req.originalUrl }, err.message);

  res.status(statusCode).json({
    success: false,
    // In production, never leak internal error details for
    // unexpected (non-operational) errors — e.g. a database
    // connection string typo shouldn't be visible to a website
    // visitor. Operational errors (like "Payment not found") are
    // always safe to show as-is.
    message: isOperational || env.NODE_ENV !== 'production' ? err.message : 'Something went wrong. Please try again later.',
    data: null,
  });
}

module.exports = { ApiError, notFoundHandler, errorHandler };
