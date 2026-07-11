/**
 * src/modules/payments/payments.service.js
 * ──────────────────────────────────────────────────────────────
 * WHAT THIS FILE DOES
 * All interaction with the Paystack REST API, plus the database
 * logic for creating, verifying, and listing Payment records. The
 * controller stays a thin HTTP layer; the webhook handler
 * (payments.webhook.js) reuses `markPaymentFromPaystackData` below
 * so "what a successful payment means" is defined in exactly one
 * place, whether we learn about it via a webhook or a manual
 * verify call.
 * ──────────────────────────────────────────────────────────────
 */

const axios = require('axios');
const crypto = require('crypto');

const prisma = require('../../config/db');
const env = require('../../config/env');
const logger = require('../../config/logger');
const { ApiError } = require('../../middleware/error.middleware');
const { queueReceiptEmail } = require('../../jobs/queue');

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

const paystackClient = axios.create({
  baseURL: PAYSTACK_BASE_URL,
  headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` },
  timeout: 10_000,
});

/** Converts a Paystack status string into our internal enum. */
function mapPaystackStatus(paystackStatus) {
  switch (paystackStatus) {
    case 'success':
      return 'SUCCESS';
    case 'failed':
      return 'FAILED';
    case 'abandoned':
      return 'ABANDONED';
    default:
      return 'PENDING';
  }
}

/**
 * Starts a new payment: creates a PENDING record with our own
 * reference, then asks Paystack for a hosted checkout URL for that
 * exact reference.
 *
 * @returns {Promise<{ authorizationUrl: string, reference: string }>}
 */
async function initiatePayment(input) {
  if (!env.PAYSTACK_SECRET_KEY) {
    // Fail with a clear, actionable message rather than a confusing
    // Paystack 401 several lines down — this is almost always a
    // missing .env value in local/dev setups.
    throw new ApiError(500, 'Payments are not configured — PAYSTACK_SECRET_KEY is missing');
  }

  // Our own reference, independent of anything Paystack generates.
  // Using our own (rather than waiting for Paystack's) means the
  // frontend can immediately poll GET /payments/verify/:reference
  // even before the giver finishes checkout.
  const reference = `church_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

  const amountMinorUnits = Math.round(input.amount * 100);

  const payment = await prisma.payment.create({
    data: {
      reference,
      amountMinorUnits,
      currency: input.currency,
      purpose: input.purpose,
      giverName: input.giverName,
      giverEmail: input.giverEmail,
      metadata: input.metadata,
      status: 'PENDING',
    },
  });

  try {
    const { data } = await paystackClient.post('/transaction/initialize', {
      email: input.giverEmail,
      amount: amountMinorUnits,
      currency: input.currency,
      reference,
      metadata: { purpose: input.purpose, paymentId: payment.id },
    });

    return { authorizationUrl: data.data.authorization_url, reference };
  } catch (err) {
    // If Paystack itself rejects the request, mark our record FAILED
    // rather than leaving an orphaned PENDING row with no way to
    // ever resolve.
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
    logger.error({ err: err.response?.data || err.message }, 'Paystack initialize failed');
    throw new ApiError(502, 'Could not start payment with Paystack — please try again');
  }
}

/**
 * Looks up a payment by OUR reference. If it's still PENDING, we
 * actively ask Paystack for the latest status rather than trusting
 * a possibly-not-yet-arrived webhook — this is what makes
 * GET /payments/verify/:reference reliable even if a webhook is
 * delayed or lost. 
 */
async function verifyPayment(reference) {
  const payment = await prisma.payment.findUnique({ where: { reference } });
  if (!payment) {
    throw new ApiError(404, 'Payment not found');
  }

  if (payment.status !== 'PENDING') {
    return payment;
  }

  const { data } = await paystackClient.get(`/transaction/verify/${encodeURIComponent(reference)}`);
  const status = mapPaystackStatus(data.data.status);

  if (status === 'PENDING') {
    return payment; // Paystack itself has no final answer yet
  }

  return prisma.payment.update({ where: { reference }, data: { status } });
}

/**
 * Applies a Paystack transaction payload (from either a webhook or
 * a manual verify call) to our Payment record. Idempotent: if
 * `paystackEventId` was already recorded, this is a no-op — the
 * unique constraint on that column, combined with this check,
 * is what prevents a payment being processed (and a receipt being
 * sent) twice for the same event.
 */
async function markPaymentFromPaystackData(paystackData, eventId) {
  const reference = paystackData.reference;
  const status = mapPaystackStatus(paystackData.status);

  const payment = await prisma.payment.findUnique({ where: { reference } });
  if (!payment) {
    logger.warn({ reference }, 'Webhook received for unknown payment reference');
    return null;
  }

  if (payment.paystackEventId === eventId) {
    logger.info({ reference, eventId }, 'Duplicate webhook event ignored');
    return payment;
  }

  const updated = await prisma.payment.update({
    where: { reference },
    data: { status, paystackEventId: eventId },
  });

  if (status === 'SUCCESS' && payment.status !== 'SUCCESS') {
    // Only queue a receipt the FIRST time a payment transitions
    // into SUCCESS — never send a duplicate receipt on a repeat
    // webhook delivery.
    await queueReceiptEmail({
      paymentId: updated.id,
      giverEmail: updated.giverEmail,
      giverName: updated.giverName,
      amountMinorUnits: updated.amountMinorUnits,
      currency: updated.currency,
      purpose: updated.purpose,
      reference: updated.reference,
    });
  }

  return updated;
}

/** Paginated, filterable list for the admin dashboard. */
async function listPayments({ page, pageSize, status, purpose }) {
  const where = {
    ...(status ? { status } : {}),
    ...(purpose ? { purpose } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.payment.count({ where }),
  ]);

  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

module.exports = { initiatePayment, verifyPayment, markPaymentFromPaystackData, listPayments };