import express from 'express';
import { getAuditLogs } from '../../controllers/auditLog.controller.js';
import { requireBankOrSuper } from '../../middleware/auth.js';






const router = express.Router();


router.get('/', requireBankOrSuper, getAuditLogs);

export default router;
