/**
 * src/modules/auth/auth.routes.js
 * ──────────────────────────────────────────────────────────────
 * Mounted at /api/v1/auth (see src/routes.js).
 * ──────────────────────────────────────────────────────────────
 */

const { Router } = require('express');

const authController = require('./auth.controller');
const { loginSchema } = require('./auth.validation');
const validate = require('../../middleware/validate.middleware');
const requireAdmin = require('../../middleware/auth.middleware');
const asyncHandler = require('../../utils/asyncHandler');
const { strictLimiter } = require('../../middleware/rateLimit.middleware');

const router = Router();

// Strict rate limit on login specifically — this is the endpoint a
// brute-force script would target.
router.post('/login', strictLimiter, validate(loginSchema), asyncHandler(authController.login));

// No body validation needed — the refresh token travels as a cookie,
// not in the body.
router.post('/refresh', asyncHandler(authController.refresh));

// Must be logged in (valid access token) to log out — this is what
// tells us WHICH admin's session to invalidate.
router.post('/logout', requireAdmin, asyncHandler(authController.logout));

module.exports = router;