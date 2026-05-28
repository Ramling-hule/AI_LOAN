import logger from '../utils/logger.js';
import ApiError from '../utils/ApiError.js';

// ---------------------------------------------------------------------------
// Centralized error handler middleware.
// Must be registered LAST in the Express middleware chain.
//
// Handles:
//   - Operational ApiError instances (known errors)
//   - Mongoose validation errors
//   - JWT errors
//   - Unknown / unexpected errors
// ---------------------------------------------------------------------------

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let error = err;

  // ── Mongoose Validation Error ─────────────────────────────────────────────
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    error = ApiError.unprocessable('Validation failed', errors);
  }

  // ── Mongoose Cast Error (invalid ObjectId) ────────────────────────────────
  if (err.name === 'CastError') {
    error = ApiError.badRequest(`Invalid ${err.path}: ${err.value}`);
  }

  // ── Mongoose Duplicate Key ────────────────────────────────────────────────
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    error = ApiError.conflict(`Duplicate value for field: ${field}`);
  }

  // ── JWT Errors ────────────────────────────────────────────────────────────
  if (err.name === 'JsonWebTokenError') {
    error = ApiError.unauthorized('Invalid token');
  }
  if (err.name === 'TokenExpiredError') {
    error = ApiError.unauthorized('Token expired');
  }

  // ── Zod Validation Error ──────────────────────────────────────────────────
  if (err.name === 'ZodError') {
    const errors = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    error = ApiError.unprocessable('Request validation failed', errors);
  }

  // ── Ensure we have an ApiError ────────────────────────────────────────────
  if (!(error instanceof ApiError)) {
    const statusCode = error.statusCode || 500;
    const message =
      error.isOperational ? error.message : 'An unexpected error occurred';
    error = new ApiError(statusCode, message);
  }

  // ── Log ───────────────────────────────────────────────────────────────────
  if (error.statusCode >= 500) {
    logger.error({
      message: error.message,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
    });
  } else {
    logger.warn({
      message: error.message,
      url: req.originalUrl,
      method: req.method,
      statusCode: error.statusCode,
    });
  }

  // ── Response ──────────────────────────────────────────────────────────────
  const response = {
    success: false,
    message: error.message,
    errors: error.errors?.length ? error.errors : undefined,
  };

  // Expose stack in development only
  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
  }

  return res.status(error.statusCode).json(response);
};

export default errorHandler;
