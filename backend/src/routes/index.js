import express from 'express';

import authRoutes from './v1/auth.routes.js';
import loanRoutes from './v1/loan.routes.js';
import userRoutes from './v1/user.routes.js';
import bankRoutes from './v1/bank.routes.js';
import bankPolicyRoutes from './v1/bankPolicy.routes.js';
import ocrRoutes from './v1/ocr.routes.js';
import extractionRoutes from './v1/extraction.routes.js';
import underwritingRoutes from './v1/underwriting.routes.js';
import auditLogRoutes from './v1/auditLog.routes.js';





const router = express.Router();


router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'backend',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});


router.use('/v1/auth', authRoutes);
router.use('/v1/loans', loanRoutes);
router.use('/v1/users', userRoutes);
router.use('/v1/banks', bankRoutes);
router.use('/v1/bank-policies', bankPolicyRoutes);
router.use('/v1/ocr', ocrRoutes);
router.use('/v1/extraction', extractionRoutes);
router.use('/v1/underwriting', underwritingRoutes);
router.use('/v1/audit-logs', auditLogRoutes);

export default router;
