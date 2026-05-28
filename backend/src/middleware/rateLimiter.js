import rateLimit from 'express-rate-limit';

import env from '../config/env.js';
import ApiError from '../utils/ApiError.js';

// ---------------------------------------------------------------------------
// API rate limiter — applied to all /api routes.
// Adjust RATE_LIMIT_WINDOW_MS and RATE_LIMIT_MAX via environment variables.
// ---------------------------------------------------------------------------

export const rateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(ApiError.tooManyRequests('Too many requests — please try again later'));
  },
});

// Stricter limiter for auth routes (login, register)
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(ApiError.tooManyRequests('Too many auth attempts — please try again in 15 minutes'));
  },
});

// Rate limiter for OTP code requests
export const otpRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(ApiError.tooManyRequests('Too many OTP attempts — please try again in 5 minutes'));
  },
});
