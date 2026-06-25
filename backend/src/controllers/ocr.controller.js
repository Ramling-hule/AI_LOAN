import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import logger from '../utils/logger.js';
import OcrService from '../services/ocr.service.js';

// ---------------------------------------------------------------------------
// OCR Controller (Backend)
// Receives uploads from clients, proxies to ai-services, and exposes
// MongoDB-backed job status/result endpoints.
// ---------------------------------------------------------------------------

const VALID_STATUSES = ['queued', 'processing', 'completed', 'failed'];

// ── Upload & Submit ──────────────────────────────────────────────────────────

/**
 * POST /api/v1/ocr/upload
 * Accept a document upload, forward to ai-services, return job_id.
 * Body: multipart/form-data — field: "file"
 */
export const uploadAndProcess = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, 'No file uploaded. Use multipart/form-data with field "file".');
  }

  const {
    lang,
    oem,
    psm,
    enhance_image,
    extract_tables,
    related_document_id,
    application_id,
    document_type,
  } = req.body;

  const submittedBy = req.user?.id || null;
  const submittedByName = req.user?.admin_name || req.user?.full_name || null;

  const ocrConfig = {
    ...(lang && { lang }),
    ...(oem !== undefined && { oem: parseInt(oem) }),
    ...(psm !== undefined && { psm: parseInt(psm) }),
    enhance_image: enhance_image !== 'false',
    extract_tables: extract_tables !== 'false',
  };

  logger.info(
    `OCR Controller: Upload from ${submittedByName || 'anonymous'} — ${req.file.originalname} (${req.file.size} bytes)`
  );

  const job = await OcrService.submitJob({
    fileBuffer: req.file.buffer,
    filename: req.file.originalname,
    mimeType: req.file.mimetype,
    fileSize: req.file.size,
    submittedBy,
    submittedByName,
    relatedDocumentId: related_document_id || null,
    applicationId: application_id || '',
    documentType: document_type || 'general',
    ocrConfig,
  });

  return ApiResponse.created(
    {
      job_id: job.job_id,
      status: job.status,
      document_name: job.document_name,
      file_size: job.file_size,
      mime_type: job.mime_type,
      queued_at: job.queued_at,
    },
    'Document uploaded and queued for OCR processing'
  ).send(res);
});

// ── Job Status ───────────────────────────────────────────────────────────────

/**
 * GET /api/v1/ocr/jobs/:jobId
 * Fetch and sync job status from ai-services, return full details from DB.
 */
export const getJobStatus = asyncHandler(async (req, res) => {
  const { jobId } = req.params;

  // Sync with ai-services live state before responding
  const job = await OcrService.syncJobStatus(jobId);

  return ApiResponse.ok(job, 'OCR job details retrieved').send(res);
});

// ── List Jobs ────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/ocr/jobs
 * List OCR jobs (filtered, paginated).
 * Query: ?status=completed&limit=20&page=1&my_jobs=true
 */
export const listJobs = asyncHandler(async (req, res) => {
  const { status, limit, page, my_jobs } = req.query;

  if (status && !VALID_STATUSES.includes(status)) {
    throw new ApiError(400, `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  const submittedBy = my_jobs === 'true' && req.user?.id ? req.user.id : undefined;

  const result = await OcrService.listJobs({
    status: status || undefined,
    submittedBy,
    limit: limit ? Math.min(parseInt(limit) || 50, 200) : 50,
    page: page ? Math.max(parseInt(page) || 1, 1) : 1,
  });

  return res.json({
    success: true,
    message: 'OCR jobs retrieved',
    data: result.jobs,
    meta: {
      total: result.total,
      page: result.page,
      limit: result.limit,
      pages: Math.ceil(result.total / result.limit),
    },
  });
});

// ── Retry ────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/ocr/retry/:jobId
 * Re-enqueue a failed OCR job.
 */
export const retryJob = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  const job = await OcrService.retryJob(jobId);
  return ApiResponse.ok(job, 'OCR job re-queued for retry').send(res);
});

// ── Queue Stats ───────────────────────────────────────────────────────────────

/**
 * GET /api/v1/ocr/stats
 * Proxy queue statistics from ai-services.
 */
export const getStats = asyncHandler(async (_req, res) => {
  const stats = await OcrService.getQueueStats();
  return ApiResponse.ok(stats, 'OCR queue statistics').send(res);
});

// ── Full Job Detail ───────────────────────────────────────────────────────────

/**
 * GET /api/v1/ocr/jobs/:jobId/full
 * Return full job including raw_text and complete processing_log from DB.
 */
export const getFullJob = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  // Sync first then return full document
  await OcrService.syncJobStatus(jobId);
  const job = await OcrService.getJob(jobId);
  return ApiResponse.ok(job, 'Full OCR job details retrieved').send(res);
});

// ── Vectorization Status (Internal) ──────────────────────────────────────────

import { findLoanByAppId } from '../db/queries/loans.queries.js';
import ExtractionService from '../services/extraction.service.js';

/**
 * PATCH /api/v1/ocr/jobs/:jobId/vectorized
 * Internal endpoint — called by ai-services RAG pipeline after vectorization.
 * Updates is_vectorized, vectorized_at, vector_chunk_count in MongoDB.
 * No user auth required (internal service-to-service callback).
 */
export const markVectorized = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  const { success, chunk_count, vectorized_at, error, document_type } = req.body;

  if (typeof success !== 'boolean') {
    throw new ApiError(400, 'Request body must include "success" (boolean)');
  }

  const job = await OcrService.markJobVectorized(jobId, {
    success,
    chunk_count: chunk_count || 0,
    vectorized_at,
    error,
    document_type,
  });

  if (!job) {
    // Job not found in DB — return 200 anyway (non-fatal internal call)
    return ApiResponse.ok(null, 'Job not found in DB (may have been cleaned up)').send(res);
  }

  // Trigger automatic re-extraction if the application is in 'missing_info' or was auto-transitioned
  if (success && job.application_id) {
    setImmediate(async () => {
      try {
        const loan = await findLoanByAppId(job.application_id);
        if (loan && (loan.status === 'missing_info' || loan.status === 'submitted')) {
          logger.info(`[OCR Controller] Auto-triggering AI parameter extraction for loan ${loan.id} (appId: ${loan.app_id})`);
          await ExtractionService.triggerExtraction(
            loan.id,
            { role: 'super_admin', id: 'system' }, // system context bypasses SME check
            true // force re-run to update the parameter extraction
          );
        }
      } catch (err) {
        logger.error(`[OCR Controller] Failed to trigger auto-extraction: ${err.message}`);
      }
    });
  }

  return ApiResponse.ok(
    {
      job_id: jobId,
      is_vectorized: job.is_vectorized,
      vector_chunk_count: job.vector_chunk_count,
      vectorized_at: job.vectorized_at,
      vectorization_error: job.vectorization_error,
    },
    success ? 'Vectorization status updated' : 'Vectorization failure recorded'
  ).send(res);
});

