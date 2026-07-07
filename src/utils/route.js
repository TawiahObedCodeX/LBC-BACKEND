const express = require('express');

const authRoutes = require('./modules/auth/auth.routes');
const memberRoutes = require('./modules/members/member.routes');
const paymentRoutes = require('./modules/payments/payment.routes');
const emailRoutes = require('./modules/emails/email.routes');
const eventRoutes = require('./modules/events/event.routes');
const prayerRoutes = require('./modules/prayer-requests/prayer.routes');

const router = express.Router();

// Every route lives under /api/v1/... — versioning the API from day one
// means we can introduce breaking changes later (v2) without breaking
// whatever frontend or mobile app is already deployed against v1.
router.use('/auth', authRoutes);
router.use('/members', memberRoutes);
router.use('/payments', paymentRoutes);
router.use('/emails', emailRoutes);
router.use('/events', eventRoutes);
router.use('/prayer-requests', prayerRoutes);

module.exports = router;