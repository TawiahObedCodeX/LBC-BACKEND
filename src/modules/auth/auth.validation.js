/**
 * src/modules/auth/auth.validation.js
 * ──────────────────────────────────────────────────────────────
 * Zod schemas for every auth route. See validate.middleware.js for
 * how these get wired into Express.
 * ──────────────────────────────────────────────────────────────
 */

const { z } = require('zod');

const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Enter a valid email address'),
    password: z.string().min(1, 'Password is required'),
  }),
});

module.exports = { loginSchema };