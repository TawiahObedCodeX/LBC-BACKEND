/**
 * src/modules/payments/payments.routes.js
 * ──────────────────────────────────────────────────────────────
 * Mounted at /api/v1/payments (see src/routes.js).
 *
 * NOTE ON THE WEBHOOK ROUTE:
 * `/webhook` is registered here for readability (it lives with the
 * rest of the payments routes), but it is intentionally NOT behind
 * requireAdmin — Paystack calls it directly, with no admin session.
 * Its trust boundary is the HMAC signature check inside
 * payments.webhook.js, not a JWT.
 *
 * HOW TO TEST THIS FILE
 * After fixing this file, test with:
 *   curl -X POST http://localhost:5000/api/v1/payments/initiate \
 *     -H "Content-Type: application/json" \
 *     -d '{"amount":10,"purpose":"TITHE","giverEmail":"test@example.com"}'
 *   curl http://localhost:5000/api/v1/payments/verify/test_ref_123
 * ──────────────────────────────────────────────────────────────
 */

const { Router } = require('express');

const paymentsController = require('./payments.controller');
const { handlePaystackWebhook } = require('./payments.webhook');
const { initiatePaymentSchema, verifyPaymentSchema, listPaymentsSchema } = require('./payments.validation');
const validate = require('../../middleware/validate.middleware');
const requireAdmin = require('../../middleware/auth.middleware');
const asyncHandler = require('../../utils/asyncHandler');
const { strictLimiter } = require('../../middleware/rateLimit.middleware');

const router = Router();

/**
 * POST /api/v1/payments/initiate
 * Public — anyone can start a payment.
 * Stricter rate limit applied because this endpoint creates database
 * records and talks to Paystack (external API call = cost + latency).
 */
router.post(
  '/initiate',
  strictLimiter,
  validate(initiatePaymentSchema),
  asyncHandler(paymentsController.initiate),
);

/**
 * GET /api/v1/payments/verify/:reference
 * Public — allows the frontend to poll payment status after the
 * giver returns from Paystack's checkout page.
 */
router.get(
  '/verify/:reference',
  validate(verifyPaymentSchema),
  asyncHandler(paymentsController.verify),
);

/**
 * POST /api/v1/payments/webhook
 * Paystack-only — no auth middleware because Paystack doesn't have
 * a JWT. Security comes from HMAC-SHA512 signature verification
 * inside payments.webhook.js.
 *
 * NOTE: asyncHandler is NOT used here because the webhook handler
 * manages its own try/catch internally. It MUST respond 200 to
 * Paystack before doing any further processing, otherwise Paystack
 * retries the webhook (which could cause duplicate processing).
 */
router.post('/webhook', handlePaystackWebhook);

/**
 * GET /api/v1/payments
 * Admin-only — requires a valid JWT access token in the
 * Authorization header. Returns paginated, filterable list of all
 * payments for the admin dashboard.
 */
router.get(
  '/',
  requireAdmin,
  validate(listPaymentsSchema),
  asyncHandler(paymentsController.list),
);

module.exports = router;