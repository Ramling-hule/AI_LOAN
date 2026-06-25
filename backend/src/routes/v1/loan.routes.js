import express from 'express';
import {
  getLoans,
  createLoan,
  getLoanById,
  updateLoan,
  deleteLoan,
  getPartnerBanks,
  createDraft,
  saveDraft,
  uploadDocument,
  deleteDocument,
  submitLoan,
  changeLoanStatus,
  getLoanHistory,
  chatWithLoan,
} from '../../controllers/loan.controller.js';
import { protect, authorizeRoles, ROLES } from '../../middleware/auth.js';
import { upload } from '../../middleware/upload.js';

// ---------------------------------------------------------------------------
// Loan routes — v1
// Secured routes for commercial credit applications.
// ---------------------------------------------------------------------------

const router = express.Router();

// All endpoints require authentication
router.use(protect);

// Status transition and history endpoints
router.post('/:id/status', changeLoanStatus);
router.get('/:id/history', getLoanHistory);

// GET  /api/v1/loans/partner-banks — list lending partners
router.get('/partner-banks', getPartnerBanks);

// GET  /api/v1/loans — list applications matching user scope
router.get('/', getLoans);

// POST /api/v1/loans — create new application (restricted to SME) (backward compatible/legacy)
router.post('/', authorizeRoles(ROLES.SME), createLoan);

// ── SME Draft & Stepper Routes ───────────────────────────────────────────────
router.post('/draft', authorizeRoles(ROLES.SME), createDraft);
router.put('/draft/:id', authorizeRoles(ROLES.SME), saveDraft);
router.post('/draft/:id/upload', authorizeRoles(ROLES.SME), upload.single('file'), uploadDocument);
router.delete('/draft/:id/upload/:docType', authorizeRoles(ROLES.SME), deleteDocument);
router.post('/draft/:id/submit', authorizeRoles(ROLES.SME), submitLoan);
router.post('/draft/:id/chat', authorizeRoles(ROLES.BANK_ADMIN), chatWithLoan);

// GET  /api/v1/loans/:id — fetch single application
router.get('/:id', getLoanById);

// PATCH /api/v1/loans/:id — approve/reject/update progress (bank underwriter/admin)
router.patch('/:id', authorizeRoles(ROLES.BANK_ADMIN, ROLES.SUPER_ADMIN), updateLoan);

// DELETE /api/v1/loans/:id — delete application record (super admin only)
router.delete('/:id', authorizeRoles(ROLES.SUPER_ADMIN), deleteLoan);

export default router;
