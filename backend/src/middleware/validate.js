import ApiError from '../utils/ApiError.js';

// ---------------------------------------------------------------------------
// Zod request validation middleware factory.
//
// Usage:
//   router.post('/route', validate(MyZodSchema), controller)
//
// The schema should be a Zod object schema that validates req.body.
// On failure, throws a ZodError which is caught by errorHandler.
// ---------------------------------------------------------------------------

/**
 * @param {import('zod').ZodSchema} schema - Zod schema to validate req.body
 * @param {'body' | 'query' | 'params'} [source='body'] - Which part of request to validate
 */
const validate = (schema, source = 'body') => (req, _res, next) => {
  try {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const errors = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return next(ApiError.unprocessable('Validation failed', errors));
    }

    // Replace the source with the parsed (and coerced) data
    req[source] = result.data;
    return next();
  } catch (err) {
    return next(err);
  }
};

export default validate;
