/**
 * src/modules/newsletter/newsletter.controller.js
 * ──────────────────────────────────────────────────────────────
 * Thin HTTP layer over newsletter.service.js. Each function:
 *   1. Reads what it needs from req (body, params, query)
 *   2. Calls the matching service function
 *   3. Shapes and sends the response using the apiResponse helper
 *
 * No business logic, no database queries, no email sending —
 * all of that lives in newsletter.service.js. This separation means
 * you can test the business logic without standing up a full HTTP
 * server, and test the HTTP layer by mocking the service.
 * ──────────────────────────────────────────────────────────────
 */

const newsletterService = require('./newsletter.service');
const { success } = require('../../utils/apiResponse');
const { queueConfirmationEmail, queueWelcomeEmail } = require('../../jobs/queue');

async function subscribe(req, res) {
  const { email } = req.body;
  const { subscriber, isNew } = await newsletterService.subscribe(email);

  // Only send a confirmation email if this is a genuinely new
  // subscription (or a reactivation). Resending to an already-PENDING
  // address would be confusing — "why did I get this twice?"
  if (subscriber.status === 'PENDING' && subscriber.confirmToken) {
    await queueConfirmationEmail({
      email: subscriber.email,
      confirmToken: subscriber.confirmToken,
    });
  }

  const message = isNew
    ? 'Please check your email to confirm your subscription'
    : 'You are already subscribed or a confirmation email has already been sent';

  return success(res, { email: subscriber.email, status: subscriber.status }, message, 201);
}

async function confirm(req, res) {
  const { token } = req.params;
  await newsletterService.confirmEmail(token);

  // Queue a welcome email — this is a nice touch that confirms to
  // the subscriber "you're in!" and gives them a clear path to
  // unsubscribe if they change their mind.
  const subscriber = await newsletterService.confirmEmail(token);
  await queueWelcomeEmail({ email: subscriber.email, unsubscribeToken: subscriber.unsubscribeToken });

  return success(res, null, 'Email confirmed successfully. You are now subscribed!');
}

async function unsubscribe(req, res) {
  const { token } = req.body;
  await newsletterService.unsubscribe(token);

  return success(res, null, 'You have been unsubscribed. We\'re sorry to see you go.');
}

async function sendCampaign(req, res) {
  const { subject, bodyHtml } = req.body;
  const campaign = await newsletterService.sendCampaign(subject, bodyHtml);

  return success(
    res,
    { campaignId: campaign.id, totalRecipients: campaign.totalRecipients },
    `Newsletter queued for ${campaign.totalRecipients} recipients`,
    201,
  );
}

async function listSubscribers(req, res) {
  const result = await newsletterService.listSubscribers(req.query);
  return success(res, result, 'Subscribers retrieved');
}

async function getCampaign(req, res) {
  const campaign = await newsletterService.getCampaign(req.params.id);
  return success(res, { campaign }, 'Campaign retrieved');
}

module.exports = { subscribe, confirm, unsubscribe, sendCampaign, listSubscribers, getCampaign };