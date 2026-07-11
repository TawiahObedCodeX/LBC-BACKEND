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

module.exports = { initiate, verify, list };