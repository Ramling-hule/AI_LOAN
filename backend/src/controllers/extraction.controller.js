import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import logger from '../utils/logger.js';
import ExtractionService from '../services/extraction.service.js';
import UnderwritingService from '../services/underwriting.service.js';














const triggerExtraction = asyncHandler(async (req, res) => {
  const { loanId } = req.params;
  const result = await ExtractionService.triggerExtraction(loanId, req.user, false);

  res.status(202).json({
    success: true,
    message: 'AI extraction pipeline triggered',
    data: result,
  });
});


const reExtractLoan = asyncHandler(async (req, res) => {
  const { loanId } = req.params;
  const result = await ExtractionService.triggerExtraction(loanId, req.user, true);

  res.json({
    success: true,
    message: 'AI extraction re-triggered',
    data: result,
  });
});


const getExtractionResult = asyncHandler(async (req, res) => {
  const { loanId } = req.params;
  const result = await ExtractionService.getExtractionResult(loanId, req.user);

  res.json({
    success: true,
    data: result,
  });
});


const handleExtractionStatus = asyncHandler(async (req, res) => {
  const { loanId } = req.params;

  logger.info(`[Extraction Controller] extraction-status callback for loan ${loanId}`);

  await ExtractionService.handleExtractionComplete(loanId, req.body);

  if (req.body.is_complete) {
    
    UnderwritingService.runUnderwriting(loanId, { role: 'system', id: 'system' }).catch(err => {
      logger.error(`[Auto-Trigger] Failed to start underwriting for ${loanId}: ${err.message}`);
    });
  }

  res.json({ success: true, message: 'Extraction status updated' });
});


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
