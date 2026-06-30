import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import logger from '../utils/logger.js';
import UnderwritingService from '../services/underwriting.service.js';
import ExtractionService from '../services/extraction.service.js';
import OcrService from '../services/ocr.service.js';


const triggerAssessment = asyncHandler(async (req, res) => {
  const { loanId } = req.params;

  logger.info(`[Underwriting Controller] Triggering assessment for loan ${loanId}`);

  const assessment = await UnderwritingService.triggerAssessment(loanId, req.user);

  res.status(200).json({
    success: true,
    message: 'AI credit underwriting evaluation successful',
    data: assessment,
  });
});


const reevaluateLoan = asyncHandler(async (req, res) => {
  const { loanId } = req.params;

  logger.info(`[Underwriting Controller] Re-evaluating loan ${loanId} from extraction to underwriting assessment`);

  
  

  
  const assessment = await UnderwritingService.triggerAssessment(loanId, req.user, { force: true });

  res.status(200).json({
    success: true,
    message: 'AI credit underwriting re-evaluation successful',
    data: assessment,
  });
});


const getAssessmentReport = asyncHandler(async (req, res) => {
  const { loanId } = req.params;

  const assessment = await UnderwritingService.getAssessment(loanId, req.user);

  if (!assessment) {
    throw ApiError.notFound('No AI underwriting report exists for this loan application yet. Please run assessment first.');
  }

  res.json({
    success: true,
    data: assessment,
  });
});


const notifyPolicyIssue = asyncHandler(async (req, res) => {
  const { loanId } = req.params;
  const { policyTitle, details } = req.body;

  if (!policyTitle || !details) {
    throw ApiError.badRequest('policyTitle and details are required');
  }

  logger.info(`[Underwriting Controller] Notifying policy issue for loan ${loanId}: ${policyTitle}`);

  const userContext = {
    id: req.user.id,
    admin_name: req.user.admin_name || req.user.username,
  };

  const loan = await UnderwritingService.notifyPolicyIssue(loanId, policyTitle, details, userContext);

  res.status(200).json({
    success: true,
    message: 'Policy issue notification sent to user successfully',
    data: loan,
  });
});


const getQueueJobStatus = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  const status = await UnderwritingService.getQueueJobStatus(jobId);
  if (!status) throw ApiError.notFound('Job not found');

  res.json({
    success: true,
    data: status,
  });
});

export default {
  triggerAssessment,
  getAssessmentReport,
  reevaluateLoan,
  notifyPolicyIssue,
  getQueueJobStatus
};
