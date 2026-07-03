import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import logger from '../utils/logger.js';
import UnderwritingService from '../services/underwriting.service.js';
import ExtractionService from '../services/extraction.service.js';
import OcrService from '../services/ocr.service.js';
import { supabase } from '../db/supabaseClient.js';
import loanRepository from '../repositories/LoanRepository.js';

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

const getRuleInventory = asyncHandler(async (req, res) => {
  const { bankName } = req.params;
  
  const { data, error } = await supabase
    .from('policy_rules')
    .select('*')
    .eq('bank_id', bankName);

  if (error) {
    logger.error(`[Underwriting Controller] Error fetching rule inventory: ${error.message}`);
    throw ApiError.internal('Failed to fetch rule inventory');
  }

  res.json({
    success: true,
    data,
  });
});

const getUnderwritingAuditLogs = asyncHandler(async (req, res) => {
  const { loanId } = req.params;
  
  const loan = await loanRepository.findById(loanId);
  if (!loan) throw ApiError.notFound('Loan not found');

  const { data, error } = await supabase
    .from('underwriting_audit_logs')
    .select('*')
    .eq('application_id', loan.app_id)
    .order('timestamp', { ascending: false });

  if (error) {
    logger.error(`[Underwriting Controller] Error fetching audit logs: ${error.message}`);
    throw ApiError.internal('Failed to fetch underwriting audit logs');
  }

  res.json({
    success: true,
    data,
  });
});

export default {
  triggerAssessment,
  getAssessmentReport,
  reevaluateLoan,
  notifyPolicyIssue,
  getQueueJobStatus,
  getRuleInventory,
  getUnderwritingAuditLogs
};
