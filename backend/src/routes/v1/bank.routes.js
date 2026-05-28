import express from 'express';
import {
  getLinkedAccounts,
  sendOtp,
  verifyOtpAndLink,
  unlinkAccount,
} from '../../controllers/bank.controller.js';
import { protect, authorizeRoles, ROLES } from '../../middleware/auth.js';
import { otpRateLimiter } from '../../middleware/rateLimiter.js';

// ---------------------------------------------------------------------------
// Bank routes — v1
// Handles searching, verification, and linking of SME bank accounts.
// ---------------------------------------------------------------------------

const router = express.Router();

// All banking actions require authentication and must be accessed by SMEs
router.use(protect);
router.use(authorizeRoles(ROLES.SME));

// GET  /api/v1/banks/accounts — list linked accounts
router.get('/accounts', getLinkedAccounts);

// POST /api/v1/banks/otp/send — send OTP code (rate limited)
router.post('/otp/send', otpRateLimiter, sendOtp);

// POST /api/v1/banks/otp/verify — verify OTP and link account
router.post('/otp/verify', verifyOtpAndLink);

// DELETE /api/v1/banks/accounts/:id — unlink bank account
router.delete('/accounts/:id', unlinkAccount);

export default router;
