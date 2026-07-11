/**
 * src/middleware/validate.middleware.js
 * ──────────────────────────────────────────────────────────────
 * WHAT THIS FILE DOES
 * Wraps a Zod schema into Express middleware. Every route that
 * accepts a body, query, or params should be validated with this
 * BEFORE the controller ever runs — the controller should never
 * have to defend against malformed input itself.
 *
 * HOW TO USE IT
 * In a `*.validation.js` file, define a Zod schema shaped like the
 * request:
 *
 *   const loginSchema = z.object({
 *     body: z.object({
 *       email: z.string().email(),
 *       password: z.string().min(8),
 *     }),
 *   });
 *
 * Then in the matching `*.routes.js` file:
 *
 *   const validate = require('../../middleware/validate.middleware');
 *   router.post('/login', validate(loginSchema), authController.login);
 *
 * WHY VALIDATE req.body/query/params TOGETHER INSTEAD OF SEPARATELY?
 * Wrapping all three under one schema (only including the parts a
 * given route actually needs) means one middleware call per route,
 * one place to look for "what does this endpoint accept", and Zod
 * naturally reports which part (body vs query vs params) failed.
 * ──────────────────────────────────────────────────────────────
 */

const { ApiError } = require('./error.middleware');

/**
 * @param {import('zod').ZodSchema} schema - a Zod object schema
 *   shaped like `{ body?, query?, params? }`. Only include the keys
 *   the route actually uses.
 */
function validate(schema) {
  return function validateRequest(req, res, next) {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    if (!result.success) {
      // Turn Zod's issue list into one readable message, e.g.
      // "body.email: Invalid email, body.password: Too short"
      const message = result.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join(', ');

      return next(new ApiError(400, message));
    }

    // Replace req.body/query/params with the PARSED (and, where the
    // schema used .transform()/.coerce, converted) values, so
    // controllers downstream get clean, typed data.
    if (result.data.body !== undefined) req.body = result.data.body;
    if (result.data.query !== undefined) req.query = result.data.query;
    if (result.data.params !== undefined) req.params = result.data.params;

    next();
  };
}

module.exports = validate;