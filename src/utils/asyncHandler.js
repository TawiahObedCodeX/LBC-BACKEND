/**
 * src/utils/asyncHandler.js
 * ──────────────────────────────────────────────────────────────
 * WHAT THIS FILE DOES
 * Express does NOT automatically catch errors thrown inside an
 * `async` route handler — if you forget a try/catch, a rejected
 * promise just hangs the request forever instead of reaching
 * error.middleware.js.
 *
 * This wrapper fixes that once, everywhere, instead of relying on
 * every developer remembering try/catch in every controller.
 *
 * HOW TO USE IT
 *   const asyncHandler = require('../../utils/asyncHandler');
 *
 *   router.post('/login', asyncHandler(authController.login));
 *
 * Inside `authController.login`, you can now just `throw new
 * ApiError(401, 'Invalid credentials')` or let a Prisma error
 * bubble up — asyncHandler catches it and forwards it to
 * `next(err)`, which error.middleware.js turns into a JSON response.
 * ──────────────────────────────────────────────────────────────
 */

/**
 * @param {(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => Promise<any>} fn
 */
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;