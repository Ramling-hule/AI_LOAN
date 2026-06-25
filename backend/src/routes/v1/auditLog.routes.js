import express from 'express';
import { getAuditLogs } from '../../controllers/auditLog.controller.js';
import { requireBankOrSuper } from '../../middleware/auth.js';

// ---------------------------------------------------------------------------
// Audit Log Routes — v1
// Mounted at: /api/v1/audit-logs
// ---------------------------------------------------------------------------

const router = express.Router();

/**
 * GET /api/v1/audit-logs
 * Scoped retrieval of immutable compliance audit trails.
 * Roles: bank_admin, super_admin
 */
router.get('/', requireBankOrSuper, getAuditLogs);

export default router;
