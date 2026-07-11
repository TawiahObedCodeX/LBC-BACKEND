/**
 * src/middleware/auth.middleware.js
 * ──────────────────────────────────────────────────────────────
 * WHAT THIS FILE DOES
 * Protects admin-only routes (e.g. GET /payments, POST
 * /newsletter/send) by requiring a valid, unexpired JWT ACCESS
 * token in the `Authorization: Bearer <token>` header.
 *
 * WHY ACCESS TOKENS ARE CHECKED HERE, NOT REFRESH TOKENS
 * Access tokens are short-lived (see auth.service.js) and sent on
 * every request, so this middleware never touches the database —
 * it only verifies the JWT signature and expiry, which is fast
 * enough to run on every protected request. The refresh token
 * (long-lived, httpOnly cookie) is only checked at the dedicated
 * POST /auth/refresh endpoint, in auth.controller.js.
 *
 * HOW TO USE IT
 *   const requireAdmin = require('../../middleware/auth.middleware');
 *   router.get('/payments', requireAdmin, paymentsController.list);
 * ──────────────────────────────────────────────────────────────
 */

const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { ApiError } = require('./error.middleware');

function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new ApiError(401, 'Missing or malformed Authorization header'));
  }

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET);

    // Attach the decoded admin identity to the request so
    // controllers can use it (e.g. audit-logging who sent a
    // newsletter) without re-decoding the token themselves.
    req.admin = { id: payload.sub, email: payload.email };

    next();
  } catch (err) {
    // jwt.verify throws on both an invalid signature AND an
    // expired token — either way, the client should re-authenticate
    // (or call /auth/refresh) rather than get a confusing 500.
    if (err.name === 'TokenExpiredError') {
      return next(new ApiError(401, 'Access token expired'));
    }
    return next(new ApiError(401, 'Invalid access token'));
  }
}

module.exports = requireAdmin;