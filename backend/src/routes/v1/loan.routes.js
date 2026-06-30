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






const router = express.Router();


router.use(protect);


router.post('/:id/status', changeLoanStatus);
router.get('/:id/history', getLoanHistory);


router.get('/partner-banks', getPartnerBanks);


router.get('/', getLoans);


router.post('/', authorizeRoles(ROLES.SME), createLoan);


router.post('/draft', authorizeRoles(ROLES.SME), createDraft);
router.put('/draft/:id', authorizeRoles(ROLES.SME), saveDraft);
router.post('/draft/:id/upload', authorizeRoles(ROLES.SME), upload.single('file'), uploadDocument);
router.delete('/draft/:id/upload/:docType', authorizeRoles(ROLES.SME), deleteDocument);
router.post('/draft/:id/submit', authorizeRoles(ROLES.SME), submitLoan);
router.post('/draft/:id/chat', authorizeRoles(ROLES.BANK_ADMIN), chatWithLoan);


router.get('/:id', getLoanById);


router.patch('/:id', authorizeRoles(ROLES.BANK_ADMIN, ROLES.SUPER_ADMIN), updateLoan);


router.delete('/:id', authorizeRoles(ROLES.SUPER_ADMIN), deleteLoan);

export default router;
