import express from 'express';
import ExtractionController from '../../controllers/extraction.controller.js';
import { protect, authorizeRoles, ROLES } from '../../middleware/auth.js';

// ---------------------------------------------------------------------------
// Extraction Routes — v1
// Mounted at: /api/v1/extraction
//
// Auth:
//   • Trigger/fetch: protected, bank staff + super admin
//   • Internal callbacks (extraction-status, missing-info): no user auth
//     (protected by Docker internal network in production)
// ---------------------------------------------------------------------------

const router = express.Router();

// ── Internal callbacks from ai-services (no user auth guard) ─────────────────
// These are called server-to-server. In production, restrict at nginx/gateway level.

/**
 * PATCH /api/v1/extraction/loans/:loanId/extraction-status
 * Called by ai-services when extraction pipeline finishes.
 */
router.patch(
  '/loans/:loanId/extraction-status',
  ExtractionController.handleExtractionStatus
);

/**
 * PATCH /api/v1/extraction/loans/:loanId/missing-info
 * Called by ai-services when required fields are missing → triggers missing_info status.
 */
router.patch(
  '/loans/:loanId/missing-info',
  ExtractionController.handleMissingInfo
);

// ── User-facing routes (require authentication) ───────────────────────────────
router.use(protect);

/**
 * POST /api/v1/extraction/loans/:loanId/extract
 * Trigger AI parameter extraction for a submitted loan.
 * Roles: bank admin, super admin
 */
router.post(
  '/loans/:loanId/extract',
  authorizeRoles(ROLES.BANK_ADMIN, ROLES.SUPER_ADMIN),
  ExtractionController.triggerExtraction
);

/**
 * POST /api/v1/extraction/loans/:loanId/reextract
 * Force re-run extraction (bypasses cache).
 * Roles: bank admin, super admin
 */
router.post(
  '/loans/:loanId/reextract',
  authorizeRoles(ROLES.BANK_ADMIN, ROLES.SUPER_ADMIN),
  ExtractionController.reExtractLoan
);

/**
 * GET /api/v1/extraction/loans/:loanId/extraction
 * Get full extraction result with confidence scores.
 * Roles: bank admin, bank underwriter, super admin, sme (own loans only)
 */
router.get(
  '/loans/:loanId/extraction',
  ExtractionController.getExtractionResult
);

export default router;
