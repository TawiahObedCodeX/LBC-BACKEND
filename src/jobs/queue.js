/**
 * src/jobs/queue.js
 * ──────────────────────────────────────────────────────────────
 * WHAT THIS FILE DOES
 * Defines every BullMQ queue used in the app. Each queue is a
 * named list of jobs that the worker process (jobs/workers/) picks
 * up and processes. Separating queue DEFINITION from queue
 * PROCESSING means:
 *   - The API process (src/server.js) can ADD jobs to a queue
 *     without importing any worker code
 *   - The worker process (src/jobs/workers/index.js) can PROCESS
 *     jobs without importing any API route/controller code
 *   - The two processes share only this file and the Redis
 *     connection, which is exactly what you want for a clean
 *     separation of concerns.
 *
 * QUEUES IN THIS APP
 *   1. emailQueue — all outgoing emails (newsletters, receipts,
 *      confirmations, welcome emails). One queue for everything
 *      email-related keeps the worker simple: it only needs to
 *      listen to one place.
 * ──────────────────────────────────────────────────────────────
 */

const { Queue } = require('bullmq');
const redis = require('../config/redis');

/**
 * The single email queue. Every job in this queue has:
 *   - A `name` (the job type: 'send-newsletter', 'send-receipt', etc.)
 *   - A `data` payload specific to that job type
 *
 * Job names let the worker (email.worker.js) route to the right
 * handler without needing separate queues for each email type.
 */
const emailQueue = new Queue('church-email-queue', {
  connection: redis, // reuses the shared Redis connection from config/redis.js
  defaultJobOptions: {
    // Remove successfully completed jobs from Redis after 24 hours.
    // Keeps the queue small while giving you a day to check "did
    // that receipt actually send?" if a giver reports an issue.
    removeOnComplete: { age: 24 * 60 * 60 },
    // Keep failed jobs for 7 days so you can investigate/resume them.
    removeOnFail: { age: 7 * 24 * 60 * 60 },
    // Retry failed jobs up to 3 times with exponential backoff:
    // 1st retry after ~1s, 2nd after ~4s, 3rd after ~16s.
    // SMTP providers sometimes reject with a temporary error
    // (rate limit, connection blip) — a few automatic retries
    // handles that without the admin ever knowing.
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
  },
});

// ────────────────────────────────────────────────────────────────
// CONVENIENCE FUNCTIONS
// These are thin wrappers so the rest of the app never has to
// import bullmq directly or know the job names/structures. If the
// job payload shape ever changes, you only update it here.
// ────────────────────────────────────────────────────────────────

/**
 * Queues a newsletter email to a single recipient.
 * Called in a loop by newsletter.service.js's sendCampaign().
 */
async function queueCampaignEmail({ campaignId, subscriberId, email, subject, bodyHtml, unsubscribeToken }) {
  return emailQueue.add('send-newsletter', {
    campaignId,
    subscriberId,
    email,
    subject,
    bodyHtml,
    unsubscribeToken,
  });
}

/**
 * Queues a payment receipt email.
 * Called by payments.service.js's markPaymentFromPaystackData()
 * when a payment transitions to SUCCESS for the first time.
 */
async function queueReceiptEmail({ paymentId, giverEmail, giverName, amountMinorUnits, currency, purpose, reference }) {
  return emailQueue.add('send-receipt', {
    paymentId,
    giverEmail,
    giverName,
    amountMinorUnits,
    currency,
    purpose,
    reference,
    date: new Date().toISOString(),
  });
}

/**
 * Queues a subscription confirmation email (the "click to confirm"
 * email sent right after someone subscribes).
 */
async function queueConfirmationEmail({ email, confirmToken }) {
  return emailQueue.add('send-confirmation', { email, confirmToken });
}

/**
 * Queues a welcome email sent after a subscriber confirms their
 * address — a friendly "you're in!" message.
 */
async function queueWelcomeEmail({ email, unsubscribeToken }) {
  return emailQueue.add('send-welcome', { email, unsubscribeToken });
}

module.exports = {
  emailQueue,
  queueCampaignEmail,
  queueReceiptEmail,
  queueConfirmationEmail,
  queueWelcomeEmail,
};