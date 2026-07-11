/**
 * src/modules/newsletter/newsletter.routes.js
 * ──────────────────────────────────────────────────────────────
 * Mounted at /api/v1/newsletter (see src/routes.js).
 *
 * WHICH ROUTES ARE PUBLIC VS. ADMIN-ONLY
 *   Public (anyone on the website):
 *     POST /subscribe       — join the list
 *     GET  /confirm/:token  — click the confirmation link
 *     POST /unsubscribe     — click the unsubscribe link
 *
 *   Admin (requires valid JWT access token):
 *     GET  /subscribers     — view the list
 *     POST /send            — send a new campaign
 *     GET  /campaigns/:id   — check delivery status
 *
 * The unsubscribe route accepts POST (not GET) because the frontend
 * extracts the token from the unsubscribe link's query parameter
 * and sends it as JSON in the request body, which is a common
 * pattern for SPAs (Single Page Applications) where you don't want
 * a GET request to modify server state.
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
// Stricter rate limit on subscribe to prevent someone from
// scripting mass sign-ups (or signing up strangers' emails en masse
// as a form of harassment).
router.post(
  '/subscribe',
  strictLimiter,
  validate(subscribeSchema),
  asyncHandler(newsletterController.subscribe),
);

// The confirmation link is a GET because it's clicked directly from
// an email — no JSON body involved.
router.get('/confirm/:token', asyncHandler(newsletterController.confirm));

router.post(
  '/unsubscribe',
  validate(unsubscribeSchema),
  asyncHandler(newsletterController.unsubscribe),
);

// ── ADMIN ROUTES ───────────────────────────────────────────────
router.get(
  '/subscribers',
  requireAdmin,
  validate(listSubscribersSchema),
  asyncHandler(newsletterController.listSubscribers),
);

router.post(
  '/send',
  requireAdmin,
  validate(sendNewsletterSchema),
  asyncHandler(newsletterController.sendCampaign),
);

router.get(
  '/campaigns/:id',
  requireAdmin,
  validate(getCampaignSchema),
  asyncHandler(newsletterController.getCampaign),
);

module.exports = router;