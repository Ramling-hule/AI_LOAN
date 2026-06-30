import express from 'express';
import ExtractionController from '../../controllers/extraction.controller.js';
import { protect, authorizeRoles, ROLES } from '../../middleware/auth.js';











const router = express.Router();





router.patch(
  '/loans/:loanId/extraction-status',
  ExtractionController.handleExtractionStatus
);


router.patch(
  '/loans/:loanId/missing-info',
  ExtractionController.handleMissingInfo
);


router.use(protect);


router.post(
  '/loans/:loanId/extract',
  authorizeRoles(ROLES.BANK_ADMIN, ROLES.SUPER_ADMIN),
  ExtractionController.triggerExtraction
);


router.post(
  '/loans/:loanId/reextract',
  authorizeRoles(ROLES.BANK_ADMIN, ROLES.SUPER_ADMIN),
  ExtractionController.reExtractLoan
);


router.get(
  '/loans/:loanId/extraction',
  ExtractionController.getExtractionResult
);

export default router;
