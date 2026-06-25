import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import logger from '../utils/logger.js';
import ExtractionService from '../services/extraction.service.js';
import UnderwritingService from '../services/underwriting.service.js';

// ---------------------------------------------------------------------------
// Extraction Controller (Backend)
// Mounted at: /api/v1/extraction
//
// Endpoints:
//   POST   /loans/:loanId/extract            — Trigger extraction (bank staff only)
//   POST   /loans/:loanId/reextract          — Force re-extraction
//   GET    /loans/:loanId/extraction         — Get extraction result
//   PATCH  /loans/:loanId/extraction-status  — Internal: ai-services callback
//   PATCH  /loans/:loanId/missing-info       — Internal: ai-services missing-info callback
// ---------------------------------------------------------------------------

/**
 * POST /api/v1/extraction/loans/:loanId/extract
 * Trigger AI parameter extraction for a submitted loan application.
 * Only accessible by bank staff and super admins.
 */
const triggerExtraction = asyncHandler(async (req, res) => {
  const { loanId } = req.params;
  const result = await ExtractionService.triggerExtraction(loanId, req.user, false);

  res.status(202).json({
    success: true,
    message: 'AI extraction pipeline triggered',
    data: result,
  });
});

/**
 * POST /api/v1/extraction/loans/:loanId/reextract
 * Force re-extraction, bypassing the cached result.
 */
const reExtractLoan = asyncHandler(async (req, res) => {
  const { loanId } = req.params;
  const result = await ExtractionService.triggerExtraction(loanId, req.user, true);

  res.json({
    success: true,
    message: 'AI extraction re-triggered',
    data: result,
  });
});

/**
 * GET /api/v1/extraction/loans/:loanId/extraction
 * Fetch extraction result for a loan (full parameters + confidence scores).
 */
const getExtractionResult = asyncHandler(async (req, res) => {
  const { loanId } = req.params;
  const result = await ExtractionService.getExtractionResult(loanId, req.user);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * PATCH /api/v1/extraction/loans/:loanId/extraction-status
 * Internal callback from ai-services when extraction completes.
 * NOT protected by user auth — protected by internal network only.
 * Payload: { extraction_id, is_complete, overall_confidence, missing_fields, parameters }
 */
const handleExtractionStatus = asyncHandler(async (req, res) => {
  const { loanId } = req.params;

  logger.info(`[Extraction Controller] extraction-status callback for loan ${loanId}`);

  await ExtractionService.handleExtractionComplete(loanId, req.body);

  if (req.body.is_complete) {
    // Auto-trigger Underwriting in the background
    UnderwritingService.runUnderwriting(loanId, { role: 'system', id: 'system' }).catch(err => {
      logger.error(`[Auto-Trigger] Failed to start underwriting for ${loanId}: ${err.message}`);
    });
  }

  res.json({ success: true, message: 'Extraction status updated' });
});

/**
 * PATCH /api/v1/extraction/loans/:loanId/missing-info
 * Internal callback from ai-services when required fields are missing.
 * Transitions loan to missing_info status with field list.
 * Payload: { missing_fields: string[], extraction_id?: string }
 */
const handleMissingInfo = asyncHandler(async (req, res) => {
  const { loanId } = req.params;
  const { missing_fields, extraction_id, source } = req.body;

  if (!Array.isArray(missing_fields) || missing_fields.length === 0) {
    throw ApiError.badRequest('missing_fields must be a non-empty array');
  }

  logger.info(
    `[Extraction Controller] missing-info callback for loan ${loanId} — fields: ${missing_fields.join(', ')}`
  );

  await ExtractionService.handleMissingInfo(loanId, { missing_fields, extraction_id });

  res.json({ success: true, message: 'Missing-info status applied to loan' });
});

export default {
  triggerExtraction,
  reExtractLoan,
  getExtractionResult,
  handleExtractionStatus,
  handleMissingInfo,
};
