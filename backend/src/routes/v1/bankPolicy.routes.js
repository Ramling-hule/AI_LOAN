import express from 'express';
import {
  getPolicies,
  uploadPolicy,
  deletePolicy,
  updatePolicy,
} from '../../controllers/bankPolicy.controller.js';
import { protect, authorizeRoles, ROLES } from '../../middleware/auth.js';
import { upload } from '../../middleware/upload.js';

const router = express.Router();

// Require Bank Admin auth globally for all policy endpoints
router.use(protect);
router.use(authorizeRoles(ROLES.BANK_ADMIN));

// GET /api/v1/bank-policies — get list
router.get('/', getPolicies);

// POST /api/v1/bank-policies — upload policy PDF/image
router.post('/', upload.single('file'), uploadPolicy);

// PUT /api/v1/bank-policies/:id — update policy details or replacement file
router.put('/:id', upload.single('file'), updatePolicy);

// DELETE /api/v1/bank-policies/:id — delete custom policy
router.delete('/:id', deletePolicy);

export default router;
