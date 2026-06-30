import express from 'express';
import multer from 'multer';
import { protect } from '../../middleware/auth.js';
import ApiError from '../../utils/ApiError.js';
import {
  uploadAndProcess,
  getJobStatus,
  listJobs,
  retryJob,
  getStats,
  getFullJob,
  markVectorized,
} from '../../controllers/ocr.controller.js';









const router = express.Router();


const OCR_ALLOWED_MIMES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/tiff',
  'image/bmp',
  'image/webp',
];

const ocrUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, 
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (OCR_ALLOWED_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        ApiError.badRequest(
          `Unsupported file type: ${file.mimetype}. Allowed: PDF, PNG, JPEG, TIFF, BMP, WebP`
        )
      );
    }
  },
});






router.patch('/jobs/:jobId/vectorized', markVectorized);


router.use(protect);




router.post('/upload', ocrUpload.single('file'), uploadAndProcess);


router.get('/stats', getStats);


router.get('/jobs', listJobs);


router.get('/jobs/:jobId', getJobStatus);


router.get('/jobs/:jobId/full', getFullJob);


router.post('/retry/:jobId', retryJob);

export default router;
