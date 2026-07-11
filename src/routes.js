/**
 * src/routes.js
 * ──────────────────────────────────────────────────────────────
 * WHAT THIS FILE DOES
 * This is the single place where every feature module's router
 * gets attached to the API. app.js mounts THIS file at /api/v1, so
 * every route defined here (or in a module attached here) is
 * automatically reachable at /api/v1/<whatever-you-define>.
 * ──────────────────────────────────────────────────────────────
 */

const { Router } = require('express');
const prisma = require('./config/db');
const redis = require('./config/redis');

const router = Router();

router.get('/health', async (req, res) => {
  const checks = { database: false, redis: false };

  try {
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
router.use('/payments', require('./modules/payments/payments.routes'));
router.use('/newsletter', require('./modules/newsletter/newsletter.routes'));
router.use('/auth', require('./modules/auth/auth.routes'));

module.exports = router;