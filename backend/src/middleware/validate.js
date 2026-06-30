import ApiError from '../utils/ApiError.js';












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

    
    req[source] = result.data;
    return next();
  } catch (err) {
    return next(err);
  }
};

export default validate;
