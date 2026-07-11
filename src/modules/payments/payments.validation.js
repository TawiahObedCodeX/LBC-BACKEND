/**
 * src/modules/payments/payments.validation.js
 * ──────────────────────────────────────────────────────────────
 * Zod schemas for every payments route.
 * ──────────────────────────────────────────────────────────────
 */

const { z } = require('zod');

const PURPOSES = ['TITHE', 'OFFERING', 'DONATION', 'EVENT_TICKET'];

const initiatePaymentSchema = z.object({
  body: z.object({
    // Amount is accepted from the client in the MAIN currency unit
    // (e.g. 50.00 GHS) because that's what a human types into a
    // form — payments.service.js converts it to minor units
    // (pesewas) before talking to Paystack or storing it.
    amount: z.number().positive('Amount must be greater than zero'),
    currency: z.string().length(3).default('GHS'),
    purpose: z.enum(PURPOSES, { errorMap: () => ({ message: `Purpose must be one of: ${PURPOSES.join(', ')}` }) }),
    giverName: z.string().trim().min(1).optional(),
    giverEmail: z.string().email('Enter a valid email address'),
    metadata: z.record(z.any()).optional(),
  }),
});

const verifyPaymentSchema = z.object({
  params: z.object({
    reference: z.string().min(1, 'Reference is required'),
  }),
});

const listPaymentsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
    status: z.enum(['PENDING', 'SUCCESS', 'FAILED', 'ABANDONED']).optional(),
    purpose: z.enum(PURPOSES).optional(),
  }),
});

module.exports = { initiatePaymentSchema, verifyPaymentSchema, listPaymentsSchema };