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

// ── FIX: Added verifyFromFrontendSchema to this import ────────
// The route on line ~105 uses validate(verifyFromFrontendSchema)
// but it was never imported — causing the ReferenceError crash.
// Now it's imported alongside the other three schemas.
const {
  initiatePaymentSchema,
  verifyPaymentSchema,
  listPaymentsSchema,
  verifyFromFrontendSchema, // ← THIS WAS MISSING — the cause of the crash
} = require('./payments.validation');

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

/**
 * POST /api/v1/payments/verify-from-frontend
 * Public — called by the Next.js thank-you page after a giver
 * returns from Paystack. The frontend sends the Paystack reference
 * from the URL, and the backend verifies it with Paystack, marks
 * the payment as SUCCESS in our database, and queues a receipt.
 *
 * WHY THIS SEPARATE FROM GET /verify/:reference?
 * GET /verify/:reference looks up by OUR internal reference.
 * This endpoint accepts the PAYSTACK reference (which is what
 * the frontend has in the URL after redirect). It calls Paystack,
 * extracts our internal reference from the metadata, and updates
 * the record.
 */
router.post(
  '/verify-from-frontend',
  validate(verifyFromFrontendSchema), // ← Now this works because it's imported above
  asyncHandler(paymentsController.verifyFromFrontend),
);

module.exports = router;