import express from 'express';
import UnderwritingController from '../../controllers/underwriting.controller.js';
import { requireBankOrSuper, requireAuth } from '../../middleware/auth.js';






const router = express.Router();


router.post(
  '/loans/:loanId/assess',
  requireBankOrSuper,
  UnderwritingController.triggerAssessment
);


router.post(
  '/loans/:loanId/reevaluate',
  requireBankOrSuper,
  UnderwritingController.reevaluateLoan
);


router.post(
  '/loans/:loanId/notify-policy-issue',
  requireBankOrSuper,
  UnderwritingController.notifyPolicyIssue
);


router.get(
  '/loans/:loanId/report',
  requireAuth,
  UnderwritingController.getAssessmentReport
);


router.get(
  '/queue/status/:jobId',
  requireAuth,
  UnderwritingController.getQueueJobStatus
);

router.get(
  '/inventory/:bankName',
  requireBankOrSuper,
  UnderwritingController.getRuleInventory
);

router.get(
  '/loans/:loanId/audit-logs',
  requireAuth,
  UnderwritingController.getUnderwritingAuditLogs
);

export default router;
