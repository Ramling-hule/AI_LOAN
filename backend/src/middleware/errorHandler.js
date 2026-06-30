import logger from '../utils/logger.js';
import ApiError from '../utils/ApiError.js';













const errorHandler = (err, req, res, next) => {
  let error = err;

  
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    error = ApiError.unprocessable('Validation failed', errors);
  }

  
  if (err.name === 'CastError') {
    error = ApiError.badRequest(`Invalid ${err.path}: ${err.value}`);
  }

  
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    error = ApiError.conflict(`Duplicate value for field: ${field}`);
  }

  
  if (err.name === 'JsonWebTokenError') {
    error = ApiError.unauthorized('Invalid token');
  }
  if (err.name === 'TokenExpiredError') {
    error = ApiError.unauthorized('Token expired');
  }

  
  if (err.name === 'ZodError') {
    const errors = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    error = ApiError.unprocessable('Request validation failed', errors);
  }

  
  if (!(error instanceof ApiError)) {
    const statusCode = error.statusCode || 500;
    const message =
      error.isOperational ? error.message : 'An unexpected error occurred';
    error = new ApiError(statusCode, message);
  }

  
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

  
  const response = {
    success: false,
    message: error.message,
    errors: error.errors?.length ? error.errors : undefined,
  };

  
  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
  }

  return res.status(error.statusCode).json(response);
};

export default errorHandler;
