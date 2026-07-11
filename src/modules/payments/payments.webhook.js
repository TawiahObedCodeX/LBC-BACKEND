/**
 * src/modules/payments/payments.webhook.js
 * ──────────────────────────────────────────────────────────────
 * WHAT THIS FILE DOES
 * Receives event notifications from Paystack (e.g. "charge.success")
 * and applies them to our Payment records via payments.service.js.
 *
 * WHY SIGNATURE VERIFICATION IS NON-NEGOTIABLE
 * This endpoint is public — anyone on the internet can send a POST
 * request to it. Without verifying the signature, an attacker could
 * POST a fake "charge.success" event and trick this backend into
 * marking a payment as successful (and emailing a receipt) without
 * any money ever moving. Paystack signs every webhook with your
 * secret key using HMAC-SHA512; we recompute that signature
 * ourselves and only trust the request if it matches EXACTLY.
 *
 * WHY THIS NEEDS THE RAW REQUEST BODY
 * HMAC signatures are computed over the exact bytes Paystack sent.
 * If Express has already parsed the body into a JS object and we
 * re-serialize it with JSON.stringify, whitespace/key-order
 * differences can produce a different signature and reject
 * legitimate requests. app.js's express.json() `verify` callback
 * stashes the raw bytes on `req.rawBody` specifically so this file
 * can use them.
 * ──────────────────────────────────────────────────────────────
 */

const crypto = require('crypto');

const env = require('../../config/env');
const logger = require('../../config/logger');
const paymentsService = require('./payments.service');

function isValidSignature(rawBody, signatureHeader) {
  if (!rawBody || !signatureHeader) return false;

  const expected = crypto
    .createHmac('sha512', env.PAYSTACK_SECRET_KEY)
    .update(rawBody)
    .digest('hex');

  // timingSafeEqual prevents a timing attack from being able to
  // guess the correct signature one byte at a time. Both buffers
  // must be equal length or it throws, so we guard that first.
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const receivedBuffer = Buffer.from(signatureHeader, 'utf8');

  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

async function handlePaystackWebhook(req, res) {
  const signature = req.headers['x-paystack-signature'];

  if (!isValidSignature(req.rawBody, signature)) {
    logger.warn('Rejected webhook request with invalid Paystack signature');
    // 401, not 400 — this is specifically an authentication failure.
    // Respond quickly; never process the body of an unverified request.
    return res.status(401).json({ success: false, message: 'Invalid signature', data: null });
  }

  const event = req.body;

  // Acknowledge receipt to Paystack IMMEDIATELY (before any further
  // processing). Paystack retries webhooks that don't get a fast
  // 2xx response — acknowledging first avoids duplicate deliveries
  // caused by our own processing taking too long.
  res.status(200).json({ success: true, message: 'Received', data: null });

  try {
    if (event.event === 'charge.success' || event.event === 'charge.failed') {
      // Paystack doesn't send a dedicated event ID field by default,
      // so we build a stable one from the event type + reference +
      // status, which is unique per distinct outcome and identical
      // across retried deliveries of the same outcome.
      const eventId = `${event.event}:${event.data.reference}:${event.data.status}`;
      await paymentsService.markPaymentFromPaystackData(event.data, eventId);
    } else {
      logger.info({ event: event.event }, 'Ignored non-payment Paystack webhook event');
    }
  } catch (err) {
    // We've already responded 200 to Paystack, so log loudly here —
    // this is the only place this failure will ever be visible.
    logger.error({ err }, 'Failed to process Paystack webhook after acknowledging it');
  }
}

module.exports = { handlePaystackWebhook };