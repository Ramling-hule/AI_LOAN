import express from 'express';
import {
  getPolicies,
  uploadPolicy,
  deletePolicy,
  updatePolicy,
  extractPolicyRules,
} from '../../controllers/bankPolicy.controller.js';
import { protect, authorizeRoles, ROLES } from '../../middleware/auth.js';
import { upload } from '../../middleware/upload.js';

const router = express.Router();


router.use(protect);
router.use(authorizeRoles(ROLES.BANK_ADMIN));


router.get('/', getPolicies);


router.post('/', upload.single('file'), uploadPolicy);


router.put('/:id', upload.single('file'), updatePolicy);


router.delete('/:id', deletePolicy);

router.post('/:id/extract', extractPolicyRules);

export default router;
