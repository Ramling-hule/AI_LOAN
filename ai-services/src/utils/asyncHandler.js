'use strict';

// Shared utils — same pattern as backend
const ApiError = require('./ApiError');

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
