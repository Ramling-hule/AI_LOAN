import axios from 'axios';
import { Loan, LoanStatusHistory, BankAdminUser, SMEUser } from '../models/index.js';
import ApiError from '../utils/ApiError.js';
import logger from '../utils/logger.js';
import env from '../config/env.js';
import EmailService from './email.service.js';

// ---------------------------------------------------------------------------
// Extraction Service (Backend)
//
// Acts as a proxy + orchestrator between the backend and ai-services
// extraction endpoint. Handles:
//   • Triggering extraction on ai-services
//   • Updating loan MongoDB record with extraction status + summary
//   • Processing the missing-info callback from ai-services
// ---------------------------------------------------------------------------

const aiClient = axios.create({
  baseURL: env.AI_SERVICE_URL,
  timeout: 300_000,  // 5 min — Ollama inference can be slow on CPU
  headers: { 'Content-Type': 'application/json' },
});

// Human-readable field labels for the missing-info notification
const FIELD_LABELS = {
  gstin: 'GST Identification Number (GSTIN)',
  pan: 'PAN (Permanent Account Number)',
  cin: 'Company Identification Number (CIN)',
  llpin: 'LLP Identification Number (LLPIN)',
  annual_turnover: 'Annual Turnover',
  net_profit: 'Net Profit / Loss',
  total_liabilities: 'Total Liabilities',
  avg_monthly_balance: 'Average Monthly Bank Balance',
  cheque_bounce_count: 'Cheque Bounce / ECS Return Count',
  loan_balances: 'Existing Loan Balances',
  promoter_details: 'Promoter / Director Details',
  collateral_details: 'Collateral / Security Details',
};

const ExtractionService = {
  /**
   * Trigger AI extraction for a loan application.
   * Sets loan status to 'eligibility_check' and updates ai_extraction_status.
   *
   * @param {string} loanId
   * @param {object} userContext
   * @param {boolean} [force=false]
   */
  async triggerExtraction(loanId, userContext, force = false) {
    const loan = await Loan.findById(loanId);
    if (!loan) throw ApiError.notFound('Loan application not found');

    // Auth: only bank staff or super admin can trigger extraction
    if (userContext.role === 'sme') {
      throw ApiError.forbidden('SME applicants cannot trigger AI extraction');
    }

    if (loan.status === 'draft') {
      throw ApiError.badRequest('Loan must be submitted before extraction can run');
    }

    if (loan.ai_extraction_status === 'processing' && !force) {
      logger.info(
        `[Extraction Service] Extraction already in progress for loan=${loanId}. Skipping duplicate trigger.`
      );
      return {
        loan_id: loanId,
        application_id: loan.appId,
        skipped: true,
      };
    }

    const applicationId = loan.appId;

    logger.info(
      `[Extraction Service] Triggering extraction for loan=${loanId}, app=${applicationId}, force=${force}`
    );

    // Mark as processing
    loan.ai_extraction_status = 'processing';
    await loan.save();

    let aiResponse;
    try {
      const endpoint = force
        ? `/api/v1/extraction/rerun/${applicationId}`
        : `/api/v1/extraction/run/${applicationId}`;

      const response = await aiClient.post(endpoint, {
        loan_id: loanId,
        enable_second_pass: true,
      });

      aiResponse = response.data?.data;
    } catch (err) {
      loan.ai_extraction_status = 'failed';
      await loan.save();
      const aiMsg = err.response?.data?.message || err.message;
      throw ApiError.internal(
        `AI extraction service error: ${aiMsg}`
      );
    }

    // Update loan with result
    await ExtractionService._updateLoanAfterExtraction(loan, aiResponse);

    return {
      loan_id: loanId,
      application_id: applicationId,
      ...aiResponse,
    };
  },

  /**
   * Fetch the extraction result from ai-services PostgreSQL store.
   *
   * @param {string} loanId
   * @param {object} userContext
   */
  async getExtractionResult(loanId, userContext) {
    const loan = await Loan.findById(loanId);
    if (!loan) throw ApiError.notFound('Loan application not found');

    // Auth check
    if (userContext.role === 'bank_admin' || userContext.role === 'bank_underwriter') {
      const admin = await BankAdminUser.findById(userContext.id);
      if (!admin || admin.bank_name !== loan.bank_name) {
        throw ApiError.forbidden('Not authorized to view this loan');
      }
    } else if (userContext.role === 'sme' && loan.sme_id !== userContext.id) {
      throw ApiError.forbidden('Not authorized to view this loan');
    }

    if (!loan.ai_extraction_id) {
      return {
        extraction_status: loan.ai_extraction_status,
        message: 'No extraction result available yet. Trigger extraction first.',
        extracted_summary: loan.extracted_summary,
      };
    }

    try {
      const response = await aiClient.get(
        `/api/v1/extraction/result/${loan.appId}`
      );
      return response.data?.data;
    } catch (err) {
      logger.warn(`[Extraction Service] Could not fetch result from ai-services: ${err.message}`);
      // Fall back to embedded summary
      return {
        extraction_id: loan.ai_extraction_id,
        extraction_status: loan.ai_extraction_status,
        extracted_summary: loan.extracted_summary,
        fallback: true,
      };
    }
  },

  /**
   * Internal callback — called by ai-services when extraction completes.
   * Updates the loan MongoDB record.
   *
   * @param {string} loanId
   * @param {object} payload
   */
  async handleExtractionComplete(loanId, payload) {
    const {
      extraction_id,
      is_complete,
      overall_confidence,
      missing_fields,
      extraction_model,
      parameters,
    } = payload;

    const loan = await Loan.findById(loanId);
    if (!loan) {
      logger.warn(`[Extraction Service] handleExtractionComplete: loan ${loanId} not found`);
      return;
    }

    loan.ai_extraction_id = extraction_id;
    loan.ai_extraction_status = is_complete ? 'completed' : 'partial';
    loan.ai_extracted_at = new Date();

    // Embed lightweight summary for quick dashboard queries
    loan.extracted_summary = {
      gstin: parameters?.gstin || null,
      pan: parameters?.pan || null,
      annual_turnover: parameters?.annual_turnover || null,
      net_profit: parameters?.net_profit || null,
      overall_confidence: overall_confidence || null,
      missing_fields: missing_fields || [],
    };

    await loan.save();
    logger.info(
      `[Extraction Service] Loan ${loanId} updated — complete=${is_complete}, confidence=${overall_confidence}`
    );
  },

  /**
   * Handle missing-info callback from ai-services.
   * Transitions loan to missing_info status and creates a status history entry.
   *
   * @param {string} loanId
   * @param {object} payload
   */
  async handleMissingInfo(loanId, payload) {
    const { missing_fields, extraction_id } = payload;

    const loan = await Loan.findById(loanId);
    if (!loan) {
      logger.warn(`[Extraction Service] handleMissingInfo: loan ${loanId} not found`);
      return;
    }

    // Only transition if currently in a non-terminal state
    const transitionable = ['submitted', 'eligibility_check', 'agent_review'];
    if (!transitionable.includes(loan.status)) {
      logger.info(
        `[Extraction Service] Loan ${loanId} status=${loan.status} — not transitioning to missing_info`
      );
      return;
    }

    const fromStatus = loan.status;
    loan.status = 'missing_info';
    loan.progress = 50;
    loan.ai_extraction_id = extraction_id || loan.ai_extraction_id;
    loan.ai_extraction_status = 'partial';
    await loan.save();

    // Build human-readable notes
    const fieldLabels = missing_fields.map((f) => FIELD_LABELS[f] || f);
    const notes = `AI extraction identified missing required information. The following fields could not be extracted from the uploaded documents:\n\n• ${fieldLabels.join('\n• ')}\n\nPlease upload additional documentation to provide this information.`;

    await LoanStatusHistory.create({
      loan_id: loanId,
      from_status: fromStatus,
      to_status: 'missing_info',
      changed_by: 'system',
      changed_by_name: 'AI Extraction Engine',
      changed_by_model: 'System',
      notes,
      missing_docs: missing_fields,
    });

    logger.info(
      `[Extraction Service] Loan ${loanId} → missing_info. Missing: ${missing_fields.join(', ')}`
    );

    // Send Email to SME
    try {
      const smeUser = await SMEUser.findById(loan.sme_id);
      if (smeUser) {
        await EmailService.sendMissingInfoRequest(smeUser, loan, fieldLabels);
      }
    } catch (emailErr) {
      logger.error(`[Extraction Service] Failed to send email alert: ${emailErr.message}`);
    }
  },

  /**
   * Internal: update loan MongoDB record after extraction.
   */
  async _updateLoanAfterExtraction(loan, result) {
    if (!result) return;

    const { extraction_id, is_complete, overall_confidence, missing_fields, parameters } = result;

    loan.ai_extraction_id = extraction_id || loan.ai_extraction_id;
    loan.ai_extraction_status = is_complete ? 'completed' : 'partial';
    loan.ai_extracted_at = new Date();

    if (parameters) {
      loan.extracted_summary = {
        gstin: parameters.gstin || null,
        pan: parameters.pan || null,
        annual_turnover: parameters.annual_turnover || null,
        net_profit: parameters.net_profit || null,
        overall_confidence: overall_confidence || null,
        missing_fields: missing_fields || [],
      };
    }

    await loan.save();
  },
};

export default ExtractionService;
