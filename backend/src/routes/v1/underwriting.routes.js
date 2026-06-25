import express from 'express';
import UnderwritingController from '../../controllers/underwriting.controller.js';
import { requireBankOrSuper, requireAuth } from '../../middleware/auth.js';

// ---------------------------------------------------------------------------
// Underwriting Routes — v1
// Mounted at: /api/v1/underwriting
// ---------------------------------------------------------------------------

const router = express.Router();

/**
 * POST /api/v1/underwriting/loans/:loanId/assess
 * Trigger credit risk and policy checks.
 * Roles: bank_admin, super_admin
 */
router.post(
  '/loans/:loanId/assess',
  requireBankOrSuper,
  UnderwritingController.triggerAssessment
);

/**
 * POST /api/v1/underwriting/loans/:loanId/reevaluate
 * Trigger end-to-end credit risk and parameter re-evaluation.
 * Roles: bank_admin, super_admin
 */
router.post(
  '/loans/:loanId/reevaluate',
  requireBankOrSuper,
  UnderwritingController.reevaluateLoan
);

/**
 * POST /api/v1/underwriting/loans/:loanId/notify-policy-issue
 * Notify SME applicant about a policy issue and transition status to missing_info.
 * Roles: bank_admin, super_admin
 */
router.post(
  '/loans/:loanId/notify-policy-issue',
  requireBankOrSuper,
  UnderwritingController.notifyPolicyIssue
);

/**
 * GET /api/v1/underwriting/loans/:loanId/report
 * Fetch stored underwriting assessment report.
 * Roles: bank_admin, super_admin, sme (own loans only)
 */
router.get(
  '/loans/:loanId/report',
  requireAuth,
  UnderwritingController.getAssessmentReport
);

export default router;
