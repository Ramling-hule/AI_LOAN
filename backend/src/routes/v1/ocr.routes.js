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

// ---------------------------------------------------------------------------
// OCR Routes (Backend)
// Mounted at: /api/v1/ocr
//
// All routes require authentication (protect middleware).
// File uploads are accepted via multipart/form-data.
// ---------------------------------------------------------------------------

const router = express.Router();

// ── OCR-specific Multer (wider type support + larger limit than default) ─────
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
    fileSize: 50 * 1024 * 1024, // 50 MB — PDFs can be large
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

// ── Internal service-to-service routes (NO auth) ─────────────────────────────
// Must be registered BEFORE router.use(protect) so ai-services can call
// without a JWT token. These are only reachable inside the Docker network.

/**
 * PATCH /api/v1/ocr/jobs/:jobId/vectorized
 * Internal: called by ai-services RAG pipeline to update vectorization status.
 */
router.patch('/jobs/:jobId/vectorized', markVectorized);

// ── Apply auth to all subsequent routes ──────────────────────────────────────
router.use(protect);

// ── Endpoints ─────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/ocr/upload
 * Upload a PDF or image document and enqueue for OCR extraction.
 * Returns job_id for async polling.
 */
router.post('/upload', ocrUpload.single('file'), uploadAndProcess);

/**
 * GET /api/v1/ocr/stats
 * Queue statistics from ai-services.
 */
router.get('/stats', getStats);

/**
 * GET /api/v1/ocr/jobs
 * List OCR jobs from MongoDB.
 * Query: ?status=completed&limit=20&page=1&my_jobs=true
 */
router.get('/jobs', listJobs);

/**
 * GET /api/v1/ocr/jobs/:jobId
 * Synced job status (light — omits raw_text and full log).
 */
router.get('/jobs/:jobId', getJobStatus);

/**
 * GET /api/v1/ocr/jobs/:jobId/full
 * Full job details including raw_text and complete processing_log.
 */
router.get('/jobs/:jobId/full', getFullJob);

/**
 * POST /api/v1/ocr/retry/:jobId
 * Re-enqueue a failed job.
 */
router.post('/retry/:jobId', retryJob);

export default router;
