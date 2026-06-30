import rateLimit from 'express-rate-limit';

import env from '../config/env.js';
import ApiError from '../utils/ApiError.js';






export const rateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true, 
  legacyHeaders: false,
  skip: (req) => req.originalUrl.includes('/queue/status'),
  handler: (_req, _res, next) => {
    next(ApiError.tooManyRequests('Too many requests — please try again later'));
  },
});


export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(ApiError.tooManyRequests('Too many auth attempts — please try again in 15 minutes'));
  },
});


export const otpRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, 
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(ApiError.tooManyRequests('Too many OTP attempts — please try again in 5 minutes'));
  },
});
