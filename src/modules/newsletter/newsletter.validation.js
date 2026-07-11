/**
 * src/modules/newsletter/newsletter.validation.js
 * ──────────────────────────────────────────────────────────────
 * Zod schemas for every newsletter route. Each schema mirrors
 * exactly what the route expects — body, query params, or URL
 * params. The validate middleware (../../middleware/validate.middleware.js)
 * runs these BEFORE the controller, so the controller can trust
 * the data is clean.
 *
 * WHY SEPARATE VALIDATION FROM THE CONTROLLER?
 * When validation lives here, the controller stays thin and focused
 * on "what happens when everything is valid." It also means a single
 * test can verify "does the route reject bad input with a 400?"
 * without touching the database or the email queue.
 * ──────────────────────────────────────────────────────────────
 */

const { z } = require('zod');

/**
 * POST /newsletter/subscribe
 * Only needs an email. The confirm/unsubscribe token handling is
 * entirely server-side — the subscriber never provides those.
 */
const subscribeSchema = z.object({
  body: z.object({
    email: z
      .string()
      .email('Enter a valid email address — e.g. name@example.com')
      // Normalize to lowercase. Email is case-insensitive per the
      // SMTP spec, but PostgreSQL unique constraints are case-
      // SENSITIVE by default. Lowercasing here prevents
      // "User@Example.com" and "user@example.com" from being
      // treated as two different subscribers.
      .transform((email) => email.toLowerCase().trim()),
  }),
});

/**
 * POST /newsletter/unsubscribe
 * The token arrives in the body because the frontend extracts it
 * from the unsubscribe link's query parameter and sends it as JSON.
 */
const unsubscribeSchema = z.object({
  body: z.object({
    token: z.string().min(1, 'Unsubscribe token is required'),
  }),
});

/**
 * GET /newsletter/subscribers
 * Admin-only, paginated list. Defaults are set here so the
 * controller never has to check "did they send a page number?"
 */
const listSubscribersSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
    // Optional filter — only return subscribers with a specific status.
    // Useful for the admin to check "who hasn't confirmed yet?"
    status: z.enum(['PENDING', 'ACTIVE', 'UNSUBSCRIBED']).optional(),
  }),
});

/**
 * POST /newsletter/send
 * Admin creates a new campaign. bodyHtml accepts full HTML so the
 * admin dashboard can embed a rich-text editor.
 */
const sendNewsletterSchema = z.object({
  body: z.object({
    subject: z
      .string()
      .min(1, 'Subject line is required — the email needs a subject')
      .max(200, 'Subject must be under 200 characters for deliverability'),
    bodyHtml: z
      .string()
      .min(1, 'Email body is required — you cannot send an empty newsletter'),
  }),
});

/**
 * GET /newsletter/campaigns/:id
 * Returns the delivery status of a specific past send.
 */
const getCampaignSchema = z.object({
  params: z.object({
    id: z.string().uuid('Campaign ID must be a valid UUID'),
  }),
});

module.exports = {
  subscribeSchema,
  unsubscribeSchema,
  listSubscribersSchema,
  sendNewsletterSchema,
  getCampaignSchema,
};