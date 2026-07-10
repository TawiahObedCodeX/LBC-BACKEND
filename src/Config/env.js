/**
 * src/config/env.js
 * ──────────────────────────────────────────────────────────────
 * WHAT THIS FILE DOES
 * This is the ONLY file in the whole app that is allowed to read
 * `process.env` directly. Every other file imports `env` from here
 * instead of touching `process.env` itself.
 *
 * WHY THAT MATTERS (for a developer new to the codebase)
 * 1. If a required variable is missing or malformed, the app crashes
 *    immediately on startup with a clear error — instead of crashing
 *    confusingly, mid-request, three hours into production.
 * 2. Every other file gets fully-typed, already-validated values
 *    (e.g. `env.PORT` is guaranteed to be a number, not a string).
 * 3. If you ever need to know "what environment variables does this
 *    app use?", this file is the complete, authoritative list.
 * ──────────────────────────────────────────────────────────────
 */

const { z } = require('zod');

// dotenv reads the local .env file and copies its values into
// process.env. In production (Railway, Render, AWS, etc.) this is a
// no-op because those platforms inject env vars directly — dotenv
// simply won't find a .env file there, which is fine.
require('dotenv').config();

/**
 * The schema below is the single source of truth for what env vars
 * this app needs, what type they should be, and what happens if
 * they're missing. Add a new variable here FIRST before using it
 * anywhere else in the code — that way it's always documented and
 * validated in one place.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // z.coerce.number() converts the string that process.env always
  // gives you ("5000") into an actual number (5000).
  PORT: z.coerce.number().int().positive().default(5000),

  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required — e.g. postgresql://user:pass@localhost:5432/dbname'),

  REDIS_URL: z
    .string()
    .min(1, 'REDIS_URL is required — e.g. redis://localhost:6379'),

  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters — generate one with crypto.randomBytes'),

  JWT_REFRESH_SECRET: z
    .string()
    .min(32, 'JWT_REFRESH_SECRET must be at least 32 characters — generate one with crypto.randomBytes'),

  // Comma-separated string in .env, turned into a clean array here
  // so the rest of the app never has to call .split(',') itself.
  CORS_ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean)),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),

  // Optional for now — payments/newsletter modules will need these,
  // but the server should still boot without them so a developer can
  // get `/health` working on day one before wiring up Paystack/SMTP.
  PAYSTACK_SECRET_KEY: z.string().optional().default(''),
  PAYSTACK_PUBLIC_KEY: z.string().optional().default(''),
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().optional().default(587),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
});

// safeParse (rather than parse) lets us print a readable error
// instead of a raw stack trace when something is missing.
const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid or missing environment variables:\n');
  for (const issue of parsedEnv.error.issues) {
    console.error(`   • ${issue.path.join('.')}: ${issue.message}`);
  }
  console.error('\n👉 Check your .env file against .env.example, then try again.\n');
  // Exit immediately — there is no safe way to run the app with bad config.
  process.exit(1);
}

// Everything after this line can safely assume `env` is complete and correct.
const env = parsedEnv.data;

module.exports = env;
