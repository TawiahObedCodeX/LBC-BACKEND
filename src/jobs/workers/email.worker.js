/**
 * src/jobs/workers/email.worker.js
 * ──────────────────────────────────────────────────────────────
 * WHAT THIS FILE DOES
 * This is the actual email sender. It runs in a SEPARATE PROCESS
 * (started by `yarn worker`, which runs src/jobs/workers/index.js).
 * It listens to the email queue and processes jobs one at a time.
 *
 * WHY A SEPARATE PROCESS?
 * Sending an email involves SMTP handshakes and network round-trips
 * that can take hundreds of milliseconds. If you did that inside
 * the API process, every newsletter send (or even a single receipt)
 * would block the request thread — the giver would wait while the
 * server talks to the SMTP provider. Moving it to a worker means
 * the API responds instantly and the worker sends the email in the
 * background.
 *
 * JOB TYPES THIS WORKER HANDLES
 *   'send-newsletter'   — one newsletter email to one subscriber
 *   'send-receipt'      — one payment receipt to one giver
 *   'send-confirmation'  — one "confirm your subscription" email
 *   'send-welcome'       — one "welcome to the list" email
 *
 * WHAT HAPPENS WHEN A JOB FAILS?
 * BullMQ's retry mechanism (configured in queue.js) automatically
 * re-queues it. If all retries are exhausted, the job moves to the
 * "failed" queue and the campaign's failedCount is incremented.
 * ──────────────────────────────────────────────────────────────
 */

const { Worker } = require('bullmq');
const nodemailer = require('nodemailer');

const redis = require('../../config/redis');
const env = require('../../config/env');
const logger = require('../../config/logger');
const prisma = require('../../config/db');
const { newsletterEmailHtml } = require('../../modules/newsletter/templates/newsletter.template');
const { receiptEmailHtml } = require('../../modules/newsletter/templates/receipt.template');

/**
 * Creates a Nodemailer transporter ONCE when the worker starts.
 * Reusing one transporter for all jobs is more efficient than
 * creating a new SMTP connection per email — Nodemailer pools
 * connections under the hood.
 */
let transporter;

function getTransporter() {
  if (transporter) return transporter;

  // If SMTP credentials aren't configured (common early in
  // development), log a warning but don't crash. The worker can
  // still start — it'll just fail any email jobs with a clear
  // "SMTP not configured" error.
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    logger.warn(
      'SMTP not fully configured (SMTP_HOST, SMTP_USER, or SMTP_PASS is missing). ' +
      'The worker will start, but email jobs will fail until SMTP is configured.'
    );
    return null;
  }

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465, // true for port 465 (SMTPS), false for 587 (STARTTLS)
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });

  logger.info('✅ SMTP transporter created');
  return transporter;
}

/**
 * Base URL used in email links (unsubscribe, website link, etc.).
 * Falls back to localhost in development so links are clickable
 * during local testing.
 */
function getBaseUrl() {
  // CORS_ALLOWED_ORIGINS is an array — use the first non-localhost
  // origin in production, or localhost:3000 in development.
  const origins = env.CORS_ALLOWED_ORIGINS;
  const productionOrigin = origins.find((origin) => !origin.includes('localhost'));
  return productionOrigin || origins[0] || 'http://localhost:3000';
}

// ────────────────────────────────────────────────────────────────
// JOB HANDLERS
// Each handler is a standalone async function. The worker's
// `processor` function below routes to the right handler based on
// the job name.
// ────────────────────────────────────────────────────────────────

async function handleNewsletterJob(job) {
  const { campaignId, subscriberId, email, subject, bodyHtml, unsubscribeToken } = job.data;

  const mailer = getTransporter();
  if (!mailer) {
    throw new Error('SMTP is not configured — cannot send newsletter email');
  }

  const html = newsletterEmailHtml({
    subject,
    bodyHtml,
    unsubscribeToken,
    baseUrl: getBaseUrl(),
  });

  await mailer.sendMail({
    from: `"Church Newsletter" <${env.SMTP_USER}>`,
    to: email,
    subject,
    html,
  });

  // Increment the campaign's sentCount so the admin dashboard can
  // show live progress without polling the queue itself.
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { sentCount: { increment: 1 } },
  });

  logger.info({ campaignId, subscriberId, email }, 'Newsletter email sent');
}

async function handleReceiptJob(job) {
  const { paymentId, giverEmail, giverName, amountMinorUnits, currency, purpose, reference, date } = job.data;

  const mailer = getTransporter();
  if (!mailer) {
    throw new Error('SMTP is not configured — cannot send receipt email');
  }

  const html = receiptEmailHtml({
    giverName,
    amountMinorUnits,
    currency,
    purpose,
    reference,
    date,
    baseUrl: getBaseUrl(),
  });

  await mailer.sendMail({
    from: `"Church Finance" <${env.SMTP_USER}>`,
    to: giverEmail,
    subject: `Payment Receipt — ${purpose} (${reference})`,
    html,
  });

  logger.info({ paymentId, giverEmail, reference }, 'Receipt email sent');
}

async function handleConfirmationJob(job) {
  const { email, confirmToken } = job.data;

  const mailer = getTransporter();
  if (!mailer) {
    throw new Error('SMTP is not configured — cannot send confirmation email');
  }

  const confirmUrl = `${getBaseUrl()}/confirm?token=${encodeURIComponent(confirmToken)}`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; padding: 20px;">
  <h2>Confirm Your Subscription</h2>
  <p>Thank you for subscribing to our newsletter!</p>
  <p>Please click the button below to confirm your email address:</p>
  <p style="margin: 30px 0;">
    <a href="${confirmUrl}"
       style="background-color:#2c3e50; color:#ffffff; padding:12px 24px;
              text-decoration:none; border-radius:4px; font-size:16px;">
      Confirm Subscription
    </a>
  </p>
  <p style="color:#777; font-size:12px;">
    If you didn't subscribe, you can safely ignore this email.
  </p>
</body>
</html>`;

  await mailer.sendMail({
    from: `"Church Newsletter" <${env.SMTP_USER}>`,
    to: email,
    subject: 'Confirm your subscription',
    html,
  });

  logger.info({ email }, 'Confirmation email sent');
}

async function handleWelcomeJob(job) {
  const { email, unsubscribeToken } = job.data;

  const mailer = getTransporter();
  if (!mailer) {
    throw new Error('SMTP is not configured — cannot send welcome email');
  }

  const unsubscribeUrl = `${getBaseUrl()}/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; padding: 20px;">
  <h2>Welcome! 🎉</h2>
  <p>Your email has been confirmed and you are now subscribed to our newsletter.</p>
  <p>You'll receive updates, announcements, and inspiration from us.</p>
  <p style="color:#777; font-size:12px; margin-top:30px;">
    <a href="${unsubscribeUrl}" style="color:#777;">Unsubscribe</a> at any time.
  </p>
</body>
</html>`;

  await mailer.sendMail({
    from: `"Church Newsletter" <${env.SMTP_USER}>`,
    to: email,
    subject: 'Welcome to the newsletter!',
    html,
  });

  logger.info({ email }, 'Welcome email sent');
}

// ────────────────────────────────────────────────────────────────
// WORKER CREATION
// The processor function routes each job to the right handler based
// on its name. This is the single entry point for all email jobs.
// ────────────────────────────────────────────────────────────────

function createEmailWorker() {
  const worker = new Worker(
    'church-email-queue',
    async (job) => {
      logger.info({ jobId: job.id, jobName: job.name }, 'Processing email job');

      switch (job.name) {
        case 'send-newsletter':
          return handleNewsletterJob(job);
        case 'send-receipt':
          return handleReceiptJob(job);
        case 'send-confirmation':
          return handleConfirmationJob(job);
        case 'send-welcome':
          return handleWelcomeJob(job);
        default:
          logger.warn({ jobName: job.name }, 'Unknown job type — discarding');
      }
    },
    {
      connection: redis,
      // Process one job at a time (concurrency: 1) to be gentle on
      // the SMTP provider. Increase this once you know your
      // provider's rate limits and have monitoring in place.
      concurrency: 1,
      // Remove successfully completed jobs from Redis after 24 hours.
      removeOnComplete: { age: 24 * 60 * 60 },
      removeOnFail: { age: 7 * 24 * 60 * 60 },
    },
  );

  // ── Worker event listeners ──────────────────────────────────
  // These log what the worker is doing so you can monitor it in
  // production and debug it locally.

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, jobName: job.name }, 'Email job completed');
  });

  worker.on('failed', async (job, err) => {
    logger.error({ jobId: job?.id, jobName: job?.name, err }, 'Email job failed');

    // If this was a newsletter job and all retries are exhausted,
    // increment the campaign's failedCount so the admin can see
    // exactly how many emails didn't go through.
    if (job?.name === 'send-newsletter' && job.attemptsMade >= (job.opts.attempts || 3)) {
      try {
        await prisma.campaign.update({
          where: { id: job.data.campaignId },
          data: { failedCount: { increment: 1 } },
        });
      } catch (updateErr) {
        logger.error({ updateErr, campaignId: job.data.campaignId }, 'Failed to update campaign failedCount');
      }
    }
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Worker error — this usually means a Redis connection issue');
  });

  logger.info('✅ Email worker started — waiting for jobs');
  return worker;
}

module.exports = { createEmailWorker };