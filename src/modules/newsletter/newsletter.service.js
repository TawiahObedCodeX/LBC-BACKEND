/**
 * src/modules/newsletter/newsletter.service.js
 * ──────────────────────────────────────────────────────────────
 * WHAT THIS FILE DOES
 * All business logic for the newsletter module: subscribing,
 * confirming, unsubscribing, and sending campaigns. The controller
 * (newsletter.controller.js) is a thin HTTP layer — it reads the
 * request, calls functions here, and shapes the response.
 *
 * DESIGN DECISIONS EXPLAINED
 *
 * 1. Why confirm/unsubscribe tokens instead of a login?
 *    This service doesn't have member accounts. Subscribers should
 *    be able to confirm their address or unsubscribe with one click,
 *    no password required. Random tokens (UUIDs) serve that purpose
 *    — long enough to be unguessable, cheap to generate, and
 *    revocable (just change the token in the database).
 *
 * 2. Why queue the send, not do it inline?
 *    POST /newsletter/send returns immediately (the campaign is
 *    created and jobs are placed on the queue). A separate worker
 *    process (jobs/workers/email.worker.js) picks them up. This
 *    means sending to 5,000 people never blocks the API — the admin
 *    gets a response in under a second, and the worker chews
 *    through the list steadily, respecting your SMTP provider's
 *    rate limits.
 *
 * 3. Why track sentCount / failedCount per campaign?
 *    The worker updates these counters as it goes, so the admin can
 *    call GET /newsletter/campaigns/:id and see live progress
 *    without the API needing to recompute anything from scratch on
 *    every poll.
 * ──────────────────────────────────────────────────────────────
 */

const crypto = require('crypto');

const prisma = require('../../config/db');
const { ApiError } = require('../../middleware/error.middleware');
const { queueCampaignEmail } = require('../../jobs/queue');

/**
 * Subscribes an email address to the newsletter list.
 *
 * Idempotent-ish behavior:
 *   - If the email is already ACTIVE → return it as-is (no duplicate,
 *     no second confirmation email — that would be spammy).
 *   - If the email is UNSUBSCRIBED → reactivate it with a fresh
 *     confirm token. This respects "they asked to come back"
 *     rather than permanently banning an address.
 *   - If the email is PENDING → resend the confirmation email
 *     (they might have lost the first one or it went to spam).
 *   - If the email doesn't exist → create a new PENDING subscriber
 *     with a fresh confirm token.
 *
 * @param {string} email - already lowercased + trimmed by validation
 * @returns {Promise<{ subscriber: object, isNew: boolean }>}
 */
async function subscribe(email) {
  const existing = await prisma.subscriber.findUnique({ where: { email } });

  if (existing) {
    if (existing.status === 'ACTIVE') {
      // Already confirmed — nothing to do. Return existing record
      // so the controller can tell the frontend "you're already
      // subscribed" instead of looking like an error.
      return { subscriber: existing, isNew: false };
    }

    if (existing.status === 'UNSUBSCRIBED') {
      // They previously opted out but are now re-subscribing.
      // Generate a fresh confirm token and require them to confirm
      // again — this prevents someone else re-subscribing their
      // address without their knowledge.
      const confirmToken = crypto.randomUUID();
      const subscriber = await prisma.subscriber.update({
        where: { email },
        data: { status: 'PENDING', confirmToken },
      });
      return { subscriber, isNew: true };
    }

    // Status is PENDING — they never confirmed. Resend the existing
    // confirmation email rather than creating a duplicate.
    return { subscriber: existing, isNew: false };
  }

  // Completely new subscriber.
  const confirmToken = crypto.randomUUID();
  const subscriber = await prisma.subscriber.create({
    data: {
      email,
      status: 'PENDING',
      confirmToken,
    },
  });

  return { subscriber, isNew: true };
}

/**
 * Confirms a subscriber's email address using the token sent in
 * the confirmation email.
 *
 * @param {string} token - the confirmToken from the email link
 * @returns {Promise<object>} the now-ACTIVE subscriber
 */
async function confirmEmail(token) {
  const subscriber = await prisma.subscriber.findFirst({
    where: { confirmToken: token, status: 'PENDING' },
  });

  if (!subscriber) {
    // Don't reveal WHY the token is invalid — it could be expired,
    // already used, or just made up. A vague message is safer.
    throw new ApiError(400, 'Invalid or expired confirmation link. Please try subscribing again.');
  }

  // Clear the confirm token — it's single-use. Once confirmed, the
  // only token this subscriber keeps is the unsubscribeToken.
  return prisma.subscriber.update({
    where: { id: subscriber.id },
    data: { status: 'ACTIVE', confirmToken: null },
  });
}

/**
 * Unsubscribes a subscriber using their unique, long-lived
 * unsubscribe token. This token is embedded in EVERY email we send
 * them, so they can opt out at any time with one click.
 *
 * @param {string} token - the unsubscribeToken from the email link
 * @returns {Promise<object>}
 */
async function unsubscribe(token) {
  const subscriber = await prisma.subscriber.findFirst({
    where: { unsubscribeToken: token },
  });

  if (!subscriber) {
    throw new ApiError(404, 'Invalid unsubscribe link. You may already be unsubscribed.');
  }

  if (subscriber.status === 'UNSUBSCRIBED') {
    // Idempotent — clicking unsubscribe twice shouldn't error.
    return subscriber;
  }

  return prisma.subscriber.update({
    where: { id: subscriber.id },
    data: { status: 'UNSUBSCRIBED' },
  });
}

/**
 * Creates a Campaign row and places one job per ACTIVE subscriber
 * onto the BullMQ queue. The actual email sending happens in the
 * worker process (jobs/workers/email.worker.js).
 *
 * WHY ONE JOB PER RECIPIENT INSTEAD OF ONE JOB FOR THE WHOLE LIST?
 * If a single job tried to loop through 5,000 recipients and
 * crashed halfway, we'd have no record of who got the email and
 * who didn't. Per-recipient jobs mean:
 *   - Each job succeeds or fails independently
 *   - The worker can retry individual failures
 *   - The campaign's sentCount/failedCount reflect reality
 *   - We can pause/resume the campaign at the queue level
 *
 * @param {string} subject
 * @param {string} bodyHtml
 * @returns {Promise<object>} the created campaign
 */
async function sendCampaign(subject, bodyHtml) {
  // Count active subscribers FIRST so we can set totalRecipients
  // before any jobs run — the admin dashboard can immediately show
  // "Campaign queued for 847 recipients."
  const activeCount = await prisma.subscriber.count({
    where: { status: 'ACTIVE' },
  });

  if (activeCount === 0) {
    throw new ApiError(400, 'No active subscribers to send to. The list is empty.');
  }

  const campaign = await prisma.campaign.create({
    data: {
      subject,
      bodyHtml,
      status: 'QUEUED',
      totalRecipients: activeCount,
    },
  });

  // Fetch subscriber IDs in batches to avoid loading 5,000 rows
  // into memory at once. Each batch is queued as a group of jobs.
  const BATCH_SIZE = 500;
  let cursor;

  // Mark the campaign as SENDING — the first batch of jobs will
  // start being picked up by the worker almost immediately after
  // this function returns.
  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: 'SENDING' },
  });

  do {
    const subscribers = await prisma.subscriber.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, email: true, unsubscribeToken: true },
      take: BATCH_SIZE,
      // Cursor-based pagination is more efficient than offset-based
      // for large datasets — it stays fast regardless of how many
      // rows we've already processed.
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: 'asc' },
    });

    if (subscribers.length === 0) break;

    // Place one job per subscriber onto the queue. BullMQ batches
    // these efficiently under the hood — this doesn't make 500
    // separate Redis round-trips.
    for (const subscriber of subscribers) {
      await queueCampaignEmail({
        campaignId: campaign.id,
        subscriberId: subscriber.id,
        email: subscriber.email,
        subject,
        bodyHtml,
        unsubscribeToken: subscriber.unsubscribeToken,
      });
    }

    cursor = subscribers[subscribers.length - 1].id;
  } while (cursor);

  return campaign;
}

/**
 * Paginated, filterable list of subscribers for the admin dashboard.
 */
async function listSubscribers({ page, pageSize, status }) {
  const where = status ? { status } : {};

  const [items, total] = await Promise.all([
    prisma.subscriber.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      // Never expose confirmToken or unsubscribeToken in list
      // responses — those are secrets that should only appear in
      // emails, not in an admin dashboard table.
      select: {
        id: true,
        email: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.subscriber.count({ where }),
  ]);

  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

/**
 * Returns the delivery status of a specific campaign, including
 * live sent/failed counts updated by the worker.
 */
async function getCampaign(campaignId) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
  });

  if (!campaign) {
    throw new ApiError(404, 'Campaign not found');
  }

  return campaign;
}

module.exports = {
  subscribe,
  confirmEmail,
  unsubscribe,
  sendCampaign,
  listSubscribers,
  getCampaign,
};