/**
 * config/env.js
 * ──────────────────────────────────────────────────────────
 * Single source of truth for environment variables.
 *
 * Why this file exists:
 *  - Every other file in the app should read config from HERE,
 *    never from `process.env` directly. That way there is only
 *    ONE place that knows the shape of our configuration.
 *  - We validate everything with Zod at boot time. If a required
 *    secret is missing, the app refuses to start and tells you
 *    exactly which variable is wrong — instead of crashing later
 *    with a confusing error deep inside some request handler.
 *
 * If you add a new environment variable:
 *  1. Add it to `.env.example` with a comment explaining it.
 *  2. Add it to the Zod schema below.
 *  3. Read it from `env.xxx` anywhere else in the code.
 */

const dotenv = require('dotenv');
const { z } = require('zod');

// Load the .env file into process.env (does nothing in production
// if you're injecting real env vars via your host/Docker instead).
dotenv.config();

// Small helper: turns a comma-separated string like
// "http://a.com,http://b.com" into ["http://a.com", "http://b.com"]
const csvToArray = (value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const envSchema = z.object({
  // ── Server ────────────────────────────────────────────────
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),

  // ── Database & cache ─────────────────────────────────────
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  // ── JWT / auth secrets ────────────────────────────────────
  // Each secret must be reasonably long — short secrets are brute-forceable.
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_LOGIN_CHALLENGE_SECRET: z
    .string()
    .min(32, 'JWT_LOGIN_CHALLENGE_SECRET must be at least 32 characters'),
  COOKIE_SECRET: z.string().min(32, 'COOKIE_SECRET must be at least 32 characters'),

  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  JWT_LOGIN_CHALLENGE_EXPIRES_IN: z.string().default('5m'),

  // ── OTP behaviour ─────────────────────────────────────────
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(60),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),

  // ── Paystack ──────────────────────────────────────────────
  PAYSTACK_SECRET_KEY: z.string().optional().default(''),
  PAYSTACK_PUBLIC_KEY: z.string().optional().default(''),

  // ── SMTP ──────────────────────────────────────────────────
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  SMTP_FROM: z.string().optional().default('Church <[email protected]>'),

  // ── CORS ──────────────────────────────────────────────────
  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),

  // ── Rate limiting ─────────────────────────────────────────
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
});

// Parse & validate. `safeParse` lets us print a friendly error
// instead of an ugly stack trace if something is missing.
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid or missing environment variables:');
  for (const issue of parsed.error.issues) {
    console.error(`   - ${issue.path.join('.')}: ${issue.message}`);
  }
  console.error('\nCheck your .env file against .env.example, then try again.');
  process.exit(1);
}

const data = parsed.data;

// Export a clean, typed config object used everywhere else in the app.
module.exports = {
  nodeEnv: data.NODE_ENV,
  isProduction: data.NODE_ENV === 'production',
  isTest: data.NODE_ENV === 'test',
  port: data.PORT,

  databaseUrl: data.DATABASE_URL,
  redisUrl: data.REDIS_URL,

  jwt: {
    accessSecret: data.JWT_ACCESS_SECRET,
    refreshSecret: data.JWT_REFRESH_SECRET,
    loginChallengeSecret: data.JWT_LOGIN_CHALLENGE_SECRET,
    accessExpiresIn: data.JWT_ACCESS_EXPIRES_IN,
    refreshExpiresIn: data.JWT_REFRESH_EXPIRES_IN,
    loginChallengeExpiresIn: data.JWT_LOGIN_CHALLENGE_EXPIRES_IN,
  },

  cookieSecret: data.COOKIE_SECRET,

  otp: {
    ttlSeconds: data.OTP_TTL_SECONDS,
    resendCooldownSeconds: data.OTP_RESEND_COOLDOWN_SECONDS,
    maxAttempts: data.OTP_MAX_ATTEMPTS,
  },

  paystack: {
    secretKey: data.PAYSTACK_SECRET_KEY,
    publicKey: data.PAYSTACK_PUBLIC_KEY,
  },

  smtp: {
    host: data.SMTP_HOST,
    port: data.SMTP_PORT,
    user: data.SMTP_USER,
    pass: data.SMTP_PASS,
    from: data.SMTP_FROM,
  },

  corsAllowedOrigins: csvToArray(data.CORS_ALLOWED_ORIGINS),

  rateLimit: {
    windowMs: data.RATE_LIMIT_WINDOW_MS,
    max: data.RATE_LIMIT_MAX,
  },
};