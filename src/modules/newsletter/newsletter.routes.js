/**
 * src/modules/newsletter/newsletter.routes.js
 * ──────────────────────────────────────────────────────────────
 * Mounted at /api/v1/newsletter (see src/routes.js).
 * ──────────────────────────────────────────────────────────────
 */

const { Router } = require('express');

const newsletterController = require('./newsletter.controller');
const {
  subscribeSchema,
  unsubscribeSchema,
  listSubscribersSchema,
  sendNewsletterSchema,
  getCampaignSchema,
} = require('./newsletter.validation');
const validate = require('../../middleware/validate.middleware');
const requireAdmin = require('../../middleware/auth.middleware');
const asyncHandler = require('../../utils/asyncHandler');
const { strictLimiter } = require('../../middleware/rateLimit.middleware');

const router = Router();

// ── PUBLIC ROUTES ──────────────────────────────────────────────

/**
 * POST /newsletter/subscribe
 * Public — anyone can subscribe. Stricter rate limit to prevent
 * abuse (scripted mass sign-ups).
 */
router.post(
  '/subscribe',
  strictLimiter,
  validate(subscribeSchema),
  asyncHandler(newsletterController.subscribe),
);

/**
 * GET /newsletter/confirm/:token
 * Public — clicked from the confirmation email. No body validation
 * needed because the token is in the URL params.
 *
 * IMPORTANT: This route MUST exist for subscribers to confirm
 * their email address. Without it, they remain PENDING forever
 * and never receive newsletters.
 */
router.get(
  '/confirm/:token',
  asyncHandler(newsletterController.confirm),
);

/**
 * POST /newsletter/unsubscribe
 * Public — called when someone clicks the unsubscribe link in
 * an email. The token is sent as JSON in the request body.
 */
router.post(
  '/unsubscribe',
  validate(unsubscribeSchema),
  asyncHandler(newsletterController.unsubscribe),
);

// ── ADMIN ROUTES ───────────────────────────────────────────────

/**
 * GET /newsletter/subscribers
 * Admin only — paginated list of all subscribers.
 */
router.get(
  '/subscribers',
  requireAdmin,
  validate(listSubscribersSchema),
  asyncHandler(newsletterController.listSubscribers),
);

/**
 * POST /newsletter/send
 * Admin only — queues a newsletter campaign to all active
 * subscribers.
 */
router.post(
  '/send',
  requireAdmin,
  validate(sendNewsletterSchema),
  asyncHandler(newsletterController.sendCampaign),
);

/**
 * GET /newsletter/campaigns/:id
 * Admin only — delivery status of a specific campaign.
 */
router.get(
  '/campaigns/:id',
  requireAdmin,
  validate(getCampaignSchema),
  asyncHandler(newsletterController.getCampaign),
);

module.exports = router;