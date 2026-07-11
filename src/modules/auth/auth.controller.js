/**
 * src/modules/auth/auth.controller.js
 * ──────────────────────────────────────────────────────────────
 * Thin HTTP layer: read the request, call auth.service.js, shape
 * the response. No business logic lives here — see auth.service.js
 * for how login/refresh/logout actually work.
 * ──────────────────────────────────────────────────────────────
 */

const authService = require('./auth.service');
const { success } = require('../../utils/apiResponse');
const env = require('../../config/env');

// Shared cookie options for the refresh token. `secure: true` in
// production means the cookie is ONLY ever sent over HTTPS — fine
// in production (always HTTPS), but would silently break local
// HTTP development, hence the NODE_ENV check.
function refreshCookieOptions() {
  return {
    httpOnly: true, // never readable by client-side JavaScript
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict', // never sent on cross-site requests
    maxAge: authService.REFRESH_TOKEN_TTL_MS,
    path: '/api/v1/auth', // only sent back to auth endpoints, not the whole API
  };
}

async function login(req, res) {
  const { email, password } = req.body;
  const { accessToken, refreshToken, admin } = await authService.login(email, password);

  res.cookie('refreshToken', refreshToken, refreshCookieOptions());

  return success(res, { accessToken, admin }, 'Logged in successfully');
}

async function refresh(req, res) {
  const { accessToken, refreshToken } = await authService.refresh(req.cookies.refreshToken);

  res.cookie('refreshToken', refreshToken, refreshCookieOptions());

  return success(res, { accessToken }, 'Access token refreshed');
}

async function logout(req, res) {
  await authService.logout(req.admin.id);

  res.clearCookie('refreshToken', { path: '/api/v1/auth' });

  return success(res, null, 'Logged out successfully');
}

module.exports = { login, refresh, logout };