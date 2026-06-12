import axios from 'axios';
import { Loan, BankPolicyDocument, LoanStatusHistory } from '../models/index.js';
import ApiError from '../utils/ApiError.js';
import logger from '../utils/logger.js';
import env from '../config/env.js';

const aiClient = axios.create({
  baseURL: env.AI_SERVICE_URL,
  timeout: 300_000, // 5 min for inference
  headers: { 'Content-Type': 'application/json' },
});

export const UnderwritingService = {
  /**
   * Run the AI Underwriting engine on a loan application.
   *
   * @param {string} loanId - MongoDB ID of the loan
   * @param {object} userContext - Current authenticated user context
   * @returns {Promise<object>} Underwriting assessment report
   */
  async assessLoan(loanId, userContext, forceReextract = false) {
    logger.info(`[Underwriting Service] Starting AI underwriting assessment for loan=${loanId}`);

    // 1. Fetch loan application
    const loan = await Loan.findById(loanId);
    if (!loan) throw ApiError.notFound('Loan application not found');

    // Auth check: only bank staff or super admin can run underwriting assessments
    if (userContext.role === 'sme') {
      throw ApiError.forbidden('SME applicants cannot trigger AI Underwriting assessments');
    }

    // Guard: Ensure parameter extraction is run first (or auto-trigger if missing/failed/incomplete)
    const isExtractionMissing = !loan.ai_extraction_id || !['completed', 'partial'].includes(loan.ai_extraction_status);
    if (forceReextract || isExtractionMissing) {
      logger.info(`[Underwriting Service] AI Parameter Extraction is missing, failed, or force-requested. Triggering extraction...`);
      try {
        const { default: ExtractionService } = await import('./extraction.service.js');
        await ExtractionService.triggerExtraction(loanId, userContext, forceReextract);
        
        // Reload loan
        const refreshedLoan = await Loan.findById(loanId);
        if (refreshedLoan) {
          loan.ai_extraction_id = refreshedLoan.ai_extraction_id;
          loan.ai_extraction_status = refreshedLoan.ai_extraction_status;
          loan.extracted_summary = refreshedLoan.extracted_summary;
          loan.ai_extracted_at = refreshedLoan.ai_extracted_at;
        }
      } catch (err) {
        logger.error(`[Underwriting Service] Auto-trigger parameter extraction failed: ${err.message}`);
        // Only throw error if we still don't have a valid extraction status to proceed with
        if (!loan.ai_extraction_id || !['completed', 'partial'].includes(loan.ai_extraction_status)) {
          throw ApiError.badRequest(
            `AI Parameter Extraction failed: ${err.message}. Please perform parameter extraction first.`
          );
        }
      }
    }

    // 2. Load all active policies (bank-specific + system defaults)
    const policies = await BankPolicyDocument.find({
      $or: [
        { bank_name: loan.bank_name },
        { is_system_default: true }
      ]
    });

    const policyTexts = policies.map((p) => {
      const cleanContent = p.content
        ? p.content.replace(/<[^>]*>/g, '').trim()
        : p.description || '';
      return `${p.title}:\n${cleanContent}`;
    });

    logger.info(
      `[Underwriting Service] Grounding assessment against ${policyTexts.length} policy documents for bank "${loan.bank_name}"`
    );

    // 3. Invoke ai-services underwriting assess endpoint
    let report;
    try {
      const response = await aiClient.post('/api/v1/underwriting/assess', {
        application_id: loan.appId,
        policies: policyTexts,
      });
      report = response.data?.data;
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      logger.error(`[Underwriting Service] AI services assessment failed: ${msg}`);
      throw ApiError.internal(`AI Underwriting service error: ${msg}`);
    }

    if (!report) {
      throw ApiError.internal('Invalid response from AI underwriting service');
    }

    // 4. Save assessment back to MongoDB Loan document
    loan.underwriting_assessment = {
      risk_score: report.risk_score,
      risk_level: report.risk_level,
      eligibility_summary: report.eligibility_summary,
      approval_recommendation: report.approval_recommendation,
      rejection_explanation: report.rejection_explanation || null,
      checks: {
        turnover_eligibility: {
          status: report.checks?.turnover_eligibility?.status || 'WARNING',
          details: report.checks?.turnover_eligibility?.details || ''
        },
        gst_consistency: {
          status: report.checks?.gst_consistency?.status || 'WARNING',
          details: report.checks?.gst_consistency?.details || ''
        },
        existing_liabilities: {
          status: report.checks?.existing_liabilities?.status || 'WARNING',
          details: report.checks?.existing_liabilities?.details || ''
        },
        cheque_bounce_patterns: {
          status: report.checks?.cheque_bounce_patterns?.status || 'WARNING',
          details: report.checks?.cheque_bounce_patterns?.details || ''
        },
        suspicious_behaviour: {
          status: report.checks?.suspicious_behaviour?.status || 'WARNING',
          details: report.checks?.suspicious_behaviour?.details || ''
        }
      },
      reasoning: report.reasoning,
      assessed_at: new Date()
    };

    // Update risk score on the loan
    loan.risk_score = report.risk_score;
    await loan.save();

    // Create a history status log for the assessment (does not change status automatically)
    await LoanStatusHistory.create({
      loan_id: loan._id,
      from_status: loan.status,
      to_status: loan.status,
      changed_by: userContext.id,
      changed_by_name: userContext.admin_name || 'AI Underwriter',
      changed_by_model: 'BankAdminUser',
      notes: `AI Underwriting assessment executed. Risk Score: ${report.risk_score} (${report.risk_level} Risk). Recommendation: ${report.approval_recommendation}.`,
    });

    logger.info(
      `[Underwriting Service] Stored assessment and risk score (${report.risk_score}) for loan ${loanId}`
    );

    return loan.underwriting_assessment;
  },

  /**
   * Fetch stored underwriting assessment report.
   *
   * @param {string} loanId
   * @param {object} userContext
   * @returns {Promise<object|null>}
   */
  async getAssessmentReport(loanId, userContext) {
    const loan = await Loan.findById(loanId);
    if (!loan) throw ApiError.notFound('Loan application not found');

    // Auth check
    if (userContext.role === 'sme' && loan.sme_id !== userContext.id) {
      throw ApiError.forbidden('You are not authorized to view underwriting reports for other companies');
    }

    return loan.underwriting_assessment || null;
  }
};

export default UnderwritingService;
