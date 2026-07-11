/**
 * src/modules/auth/auth.service.js
 * ──────────────────────────────────────────────────────────────
 * WHAT THIS FILE DOES
 * All the actual business logic for admin login sessions. The
 * controller stays thin (parse request → call service → send
 * response); everything about HOW authentication works lives here.
 *
 * THE TOKEN MODEL, EXPLAINED
 *   - ACCESS TOKEN: short-lived (15 min) JWT, sent in the response
 *     body. The frontend keeps it in memory and sends it as
 *     `Authorization: Bearer <token>` on every admin request.
 *     Short-lived on purpose — if one ever leaks, the damage window
 *     is small.
 *   - REFRESH TOKEN: long-lived (7 days) JWT, sent ONLY as an
 *     httpOnly cookie (never readable by JavaScript, so an XSS bug
 *     can't steal it). Used solely to obtain a new access token via
 *     POST /auth/refresh once the access token expires.
 *   - We store a HASH of the current refresh token on the AdminUser
 *     row (never the raw token). This lets us:
 *       1. Invalidate a session on logout — clear the hash, and any
 *          previously-issued refresh token stops working.
 *       2. Detect refresh-token theft — if a token is used that
 *          doesn't match the stored hash (e.g. an old, already-
 *          rotated one), we know something is wrong and reject it.
 *   - Every successful refresh ROTATES the token (issues a new one,
 *     stores its new hash) rather than reusing the same refresh
 *     token indefinitely.
 * ──────────────────────────────────────────────────────────────
 */

const jwt = require('jsonwebtoken');
const argon2 = require('argon2');
const crypto = require('crypto');

const prisma = require('../../config/db');
const env = require('../../config/env');
const { ApiError } = require('../../middleware/error.middleware');

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL = '7d';
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Hashes a raw token before storing it — same idea as password hashing. */
function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function signAccessToken(admin) {
  return jwt.sign({ sub: admin.id, email: admin.email }, env.JWT_ACCESS_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL,
  });
}

function signRefreshToken(admin) {
  return jwt.sign({ sub: admin.id }, env.JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_TOKEN_TTL,
  });
}

/**
 * Verifies email + password and issues a fresh token pair.
 * @returns {Promise<{ accessToken: string, refreshToken: string, admin: { id: string, name: string, email: string } }>}
 */
async function login(email, password) {
  const admin = await prisma.adminUser.findUnique({ where: { email } });

  // Deliberately vague error message — never reveal whether the
  // email exists or the password was wrong. That distinction is a
  // free hint to anyone trying to enumerate admin accounts.
  if (!admin) {
    throw new ApiError(401, 'Invalid email or password');
  }

  const passwordValid = await argon2.verify(admin.passwordHash, password);
  if (!passwordValid) {
    throw new ApiError(401, 'Invalid email or password');
  }

  const accessToken = signAccessToken(admin);
  const refreshToken = signRefreshToken(admin);

  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { refreshTokenHash: hashToken(refreshToken) },
  });

  return {
    accessToken,
    refreshToken,
    admin: { id: admin.id, name: admin.name, email: admin.email },
  };
}

/**
 * Exchanges a valid, non-rotated refresh token for a brand new
 * access + refresh token pair.
 * @returns {Promise<{ accessToken: string, refreshToken: string }>}
 */
async function refresh(rawRefreshToken) {
  if (!rawRefreshToken) {
    throw new ApiError(401, 'No refresh token provided');
  }

  let payload;
  try {
    payload = jwt.verify(rawRefreshToken, env.JWT_REFRESH_SECRET);
  } catch (err) {
    throw new ApiError(401, 'Invalid or expired refresh token');
  }

  const admin = await prisma.adminUser.findUnique({ where: { id: payload.sub } });

  if (!admin || !admin.refreshTokenHash) {
    throw new ApiError(401, 'Session no longer valid — please log in again');
  }

  // Reject if this token doesn't match what we last issued — either
  // it was already rotated (reuse of an old token, a sign of theft)
  // or the session was logged out elsewhere.
  if (hashToken(rawRefreshToken) !== admin.refreshTokenHash) {
    // As a safety measure, kill the session entirely so a stolen
    // token can't be retried.
    await prisma.adminUser.update({ where: { id: admin.id }, data: { refreshTokenHash: null } });
    throw new ApiError(401, 'Session invalid — please log in again');
  }

  const accessToken = signAccessToken(admin);
  const newRefreshToken = signRefreshToken(admin);

  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { refreshTokenHash: hashToken(newRefreshToken) },
  });

  return { accessToken, refreshToken: newRefreshToken };
}

/** Invalidates the admin's current refresh token (logout). */
async function logout(adminId) {
  await prisma.adminUser.update({
    where: { id: adminId },
    data: { refreshTokenHash: null },
  });
}

/**
 * Helper for prisma/seed.js — hashes a password the same way login
 * verifies it. Kept here so there's exactly ONE place in the app
 * that knows the password hashing algorithm/params.
 */
async function hashPassword(plainPassword) {
  return argon2.hash(plainPassword, { type: argon2.argon2id });
}

module.exports = {
  login,
  refresh,
  logout,
  hashPassword,
  REFRESH_TOKEN_TTL_MS,
};