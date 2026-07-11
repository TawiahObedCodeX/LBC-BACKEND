/**
 * src/modules/payments/payments.validation.js
 * ──────────────────────────────────────────────────────────────
 * Zod schemas for every payments route.
 * ──────────────────────────────────────────────────────────────
 */

const { z } = require('zod');

const PURPOSES = ['TITHE', 'OFFERING', 'DONATION', 'EVENT_TICKET'];

/**
 * POST /payments/initiate
 * Amount is accepted in the main currency unit (e.g. 50.00 GHS)
 * and converted to minor units by payments.service.js.
 */
const initiatePaymentSchema = z.object({
  body: z.object({
    amount: z.number().positive('Amount must be greater than zero'),
    currency: z.string().length(3).default('GHS'),
    purpose: z.enum(PURPOSES, {
      errorMap: () => ({ message: `Purpose must be one of: ${PURPOSES.join(', ')}` }),
    }),
    giverName: z.string().trim().min(1).optional(),
    giverEmail: z.string().email('Enter a valid email address'),
    metadata: z.record(z.any()).optional(),
  }),
});

/**
 * GET /payments/verify/:reference
 * Looks up a payment by our internal reference.
 */
const verifyPaymentSchema = z.object({
  params: z.object({
    reference: z.string().min(1, 'Reference is required'),
  }),
});

/**
 * GET /payments (admin only)
 * Paginated, filterable list of all payments.
 */
const listPaymentsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
    status: z.enum(['PENDING', 'SUCCESS', 'FAILED', 'ABANDONED']).optional(),
    purpose: z.enum(PURPOSES).optional(),
  }),
});

/**
 * POST /payments/verify-from-frontend
 * Used by the Next.js thank-you page after a giver returns from
 * Paystack. The frontend sends the Paystack reference from the URL,
 * and the backend verifies it with Paystack.
 */
const verifyFromFrontendSchema = z.object({
  body: z.object({
    // This is the Paystack reference (e.g. "DON_abc123_xyz789"),
    // not our internal church_ prefixed reference.
    reference: z.string().min(1, 'Reference is required'),
  }),
});

// ── Export ALL schemas ──────────────────────────────────────
// Make sure EVERY schema is listed here. If a route uses
// validate(someSchema), that schema MUST be exported from this file.
module.exports = {
  initiatePaymentSchema,
  verifyPaymentSchema,
  listPaymentsSchema,
  verifyFromFrontendSchema, // ← THIS WAS MISSING, causing the crash
};