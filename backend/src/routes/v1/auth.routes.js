import express from 'express';

import {
  smeRegister,
  smeLogin,
  bankAdminRegister,
  bankAdminLogin,
  verifyMfa,
  refresh,
  logout,
  getMe,
} from '../../controllers/auth.controller.js';
import { protect } from '../../middleware/auth.js';
import { authRateLimiter } from '../../middleware/rateLimiter.js';
import validate from '../../middleware/validate.js';
import {
  smeRegisterSchema,
  bankAdminRegisterSchema,
  loginSchema,
} from '../../validators/auth.validator.js';

// ---------------------------------------------------------------------------
// Auth Routes — v1
//
// Public:
//   POST /api/v1/auth/sme/register
//   POST /api/v1/auth/sme/login
//   POST /api/v1/auth/bank/register
//   POST /api/v1/auth/bank/login
//   POST /api/v1/auth/mfa/verify
//   POST /api/v1/auth/refresh
//
// Protected:
//   POST /api/v1/auth/logout
//   GET  /api/v1/auth/me
// ---------------------------------------------------------------------------

const router = express.Router();

// ── SME ──────────────────────────────────────────────────────────────────────
router.post(
  '/sme/register',
  authRateLimiter,
  validate(smeRegisterSchema),
  smeRegister
);

router.post(
  '/sme/login',
  authRateLimiter,
  validate(loginSchema),
  smeLogin
);

// ── Bank Admin ────────────────────────────────────────────────────────────────
router.post(
  '/bank/register',
  authRateLimiter,
  validate(bankAdminRegisterSchema),
  bankAdminRegister
);

router.post(
  '/bank/login',
  authRateLimiter,
  validate(loginSchema),
  bankAdminLogin
);

// ── Shared ────────────────────────────────────────────────────────────────────
router.post('/mfa/verify', authRateLimiter, verifyMfa);
router.post('/refresh', refresh);
router.post('/logout', protect, logout);
router.get('/me', protect, getMe);

export default router;
