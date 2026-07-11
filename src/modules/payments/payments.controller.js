/**
 * src/modules/payments/payments.controller.js
 * ──────────────────────────────────────────────────────────────
 * Thin HTTP layer over payments.service.js.
 * ──────────────────────────────────────────────────────────────
 */

const paymentsService = require('./payments.service');
const { success } = require('../../utils/apiResponse');

async function initiate(req, res) {
  const result = await paymentsService.initiatePayment(req.body);
  return success(res, result, 'Payment initiated', 201);
}

async function verify(req, res) {
  const payment = await paymentsService.verifyPayment(req.params.reference);
  return success(res, { payment }, 'Payment status retrieved');
}

async function list(req, res) {
  const result = await paymentsService.listPayments(req.query);
  return success(res, result, 'Payments retrieved');
}

//  * POST /api/v1/payments/verify-from-frontend
//  *
//  * Called by the Next.js thank-you page. The frontend has the
//  * Paystack reference from the URL query parameter. This endpoint:
//  *   1. Calls Paystack to verify the transaction
//  *   2. Extracts our internal reference from Paystack's metadata
//  *   3. Updates our Payment record
//  *   4. Returns the payment status to the frontend
//  */
async function verifyFromFrontend(req, res) {
  const { reference } = req.body;
  const result = await paymentsService.verifyFromFrontend(reference);
  return success(res, result, 'Payment verification complete');
}

module.exports = { initiate, verify, list, verifyFromFrontend };