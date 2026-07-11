/**
 * src/utils/apiResponse.js
 * ──────────────────────────────────────────────────────────────
 * WHAT THIS FILE DOES
 * Small helpers so every controller in the app sends responses in
 * the exact same shape:
 *   { success: boolean, message: string, data: any }
 *
 * WHY BOTHER WITH A HELPER FOR SOMETHING THIS SIMPLE?
 * Without it, every developer ends up writing `res.json({...})`
 * slightly differently — one forgets `message`, another nests data
 * one level too deep. The Next.js frontend then has to handle every
 * inconsistency. Using these two functions everywhere means the
 * frontend can trust the shape 100% of the time.
 *
 * HOW TO USE IT IN A CONTROLLER
 *   const { success } = require('../../utils/apiResponse');
 *   return success(res, { payment }, 'Payment created', 201);
 * ──────────────────────────────────────────────────────────────
 */

/**
 * Sends a successful response.
 * @param {import('express').Response} res
 * @param {any} data - payload to return (defaults to null)
 * @param {string} message - human-readable summary
 * @param {number} statusCode - HTTP status (defaults to 200)
 */
function success(res, data = null, message = 'Success', statusCode = 200) {
  return res.status(statusCode).json({ success: true, message, data });
}

/**
 * Sends an error response directly (bypassing the throw → error
 * middleware flow). Prefer `throw new ApiError(...)` in controllers
 * and services — this exists mainly for the rare case where you
 * need to send an error response without unwinding the stack.
 * @param {import('express').Response} res
 * @param {string} message
 * @param {number} statusCode
 */
function error(res, message = 'Something went wrong', statusCode = 500) {
  return res.status(statusCode).json({ success: false, message, data: null });
}

module.exports = { success, error };