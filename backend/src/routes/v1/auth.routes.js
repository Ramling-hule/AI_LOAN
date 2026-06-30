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

















const router = express.Router();


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


router.post('/mfa/verify', authRateLimiter, verifyMfa);
router.post('/refresh', refresh);
router.post('/logout', protect, logout);
router.get('/me', protect, getMe);

export default router;
