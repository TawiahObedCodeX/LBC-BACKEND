/**
 * src/routes.js
 * ──────────────────────────────────────────────────────────────
 * WHAT THIS FILE DOES
 * This is the single place where every feature module's router
 * gets attached to the API. app.js mounts THIS file at /api/v1, so
 * every route defined here (or in a module attached here) is
 * automatically reachable at /api/v1/<whatever-you-define>.
 *
 * HOW TO ADD A NEW MODULE LATER (e.g. payments, newsletter)
 *   const paymentsRouter = require('./modules/payments/payments.routes');
 *   router.use('/payments', paymentsRouter);
 * That single line is the ONLY change needed here — routing details
 * for that module live inside the module itself.
 * ──────────────────────────────────────────────────────────────
 */

const { Router } = require('express');
const prisma = require('./config/db');
const redis = require('./config/redis');

const router = Router();

/**
 * GET /api/v1/health
 * A simple endpoint used by:
 *   - You, manually, to confirm the API is up (`curl .../health`)
 *   - Your hosting provider, to know whether to restart the container
 *   - Uptime monitors (e.g. UptimeRobot, Better Uptime)
 *
 * It doesn't just say "the API process is running" — it actively
 * checks that the database and Redis are reachable too, because an
 * API that's "up" but can't reach its database isn't actually
 * healthy from a user's point of view.
 */
router.get('/health', async (req, res) => {
  const checks = { database: false, redis: false };

  try {
    // A trivial query that works even before any real tables exist.
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch (err) {
    req.log.error({ err }, 'Health check: database unreachable');
  }

  try {
    await redis.ping();
    checks.redis = true;
  } catch (err) {
    req.log.error({ err }, 'Health check: redis unreachable');
  }

  const allHealthy = Object.values(checks).every(Boolean);

  res.status(allHealthy ? 200 : 503).json({
    success: allHealthy,
    message: allHealthy ? 'ok' : 'degraded',
    data: {
      uptimeSeconds: Math.round(process.uptime()),
      checks,
    },
  });
});

// ── Feature modules get mounted below as they're built ──────────
// router.use('/payments', require('./modules/payments/payments.routes'));
// router.use('/newsletter', require('./modules/newsletter/newsletter.routes'));
// router.use('/auth', require('./modules/auth/auth.routes'));

module.exports = router;
