import express from 'express';
import {
  getLinkedAccounts,
  sendOtp,
  verifyOtpAndLink,
  unlinkAccount,
} from '../../controllers/bank.controller.js';
import { chatWithPolicy, getBankPolicies } from '../../controllers/bankPolicy.controller.js';
import { protect, authorizeRoles, ROLES } from '../../middleware/auth.js';
import { otpRateLimiter } from '../../middleware/rateLimiter.js';






const router = express.Router();


router.use(protect);
router.use(authorizeRoles(ROLES.SME));


router.get('/accounts', getLinkedAccounts);


router.post('/otp/send', otpRateLimiter, sendOtp);


router.post('/otp/verify', verifyOtpAndLink);


router.delete('/accounts/:id', unlinkAccount);

router.get('/policy/:bankName', getBankPolicies);
router.post('/policy/:bankName/chat', chatWithPolicy);

export default router;
