'use strict';

const logger = require('../utils/logger');
const ApiError = require('../utils/ApiError');

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let error = err;

  if (!(error instanceof ApiError)) {
    const statusCode = error.statusCode || 500;
    const message = error.isOperational ? error.message : 'An unexpected error occurred';
    error = new ApiError(statusCode, message);
  }

  if (error.statusCode >= 500) {
    logger.error({
      message: error.message,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
    });
  } else {
    logger.warn({ message: error.message, url: req.originalUrl, statusCode: error.statusCode });
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

module.exports = errorHandler;
