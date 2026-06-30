import axios from 'axios';
import { findLoanById, updateLoanDraft, createStatusHistory } from '../db/queries/loans.queries.js';
import { findSMEById, findBankAdminById } from '../db/queries/users.queries.js';
import { updateLoanExtractionStatus } from '../db/queries/loans.queries.js';
import ApiError from '../utils/ApiError.js';
import logger from '../utils/logger.js';
import env from '../config/env.js';
import EmailService from './email.service.js';







const aiClient = axios.create({
  baseURL: env.AI_SERVICE_URL,
  timeout: 600_000,  
  headers: { 'Content-Type': 'application/json' },
});

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
  async triggerExtraction(loanId, userContext, force = false) {
    const loan = await findLoanById(loanId);
    if (!loan) throw ApiError.notFound('Loan application not found');

    if (userContext.role === 'sme') throw ApiError.forbidden('SME applicants cannot trigger AI extraction');
    if (loan.status === 'draft') throw ApiError.badRequest('Loan must be submitted before extraction can run');

    if (loan.ai_extraction_status === 'processing' && !force) {
      logger.info(`[Extraction] Already in progress for loan=${loanId}. Skipping.`);
      return { loan_id: loanId, application_id: loan.app_id, skipped: true };
    }

    const applicationId = loan.app_id;
    await updateLoanDraft(loanId, { ai_extraction_status: 'processing' });

    let aiResponse;
    try {
      const endpoint = force ? `/api/v1/extraction/rerun/${applicationId}` : `/api/v1/extraction/run/${applicationId}`;
      const response = await aiClient.post(endpoint, { loan_id: loanId, enable_second_pass: true });
      aiResponse = response.data?.data;
    } catch (err) {
      await updateLoanDraft(loanId, { ai_extraction_status: 'failed' });
      const aiMsg = err.response?.data?.message || err.message;
      throw ApiError.internal(`AI extraction service error: ${aiMsg}`);
    }

    await updateLoanExtractionStatus(loanId, aiResponse);
    return { loan_id: loanId, application_id: applicationId, ...aiResponse };
  },

  async getExtractionResult(loanId, userContext) {
    const loan = await findLoanById(loanId);
    if (!loan) throw ApiError.notFound('Loan application not found');

    if (['bank_admin', 'bank_underwriter'].includes(userContext.role)) {
      const admin = await findBankAdminById(userContext.id);
      if (!admin || admin.bank_name !== loan.bank_name) throw ApiError.forbidden('Not authorized');
    } else if (userContext.role === 'sme') {
      const smeId = loan.sme_id?.id || loan.sme_id;
      if (smeId !== userContext.id) throw ApiError.forbidden('Not authorized');
    }

    if (!loan.ai_extraction_id) {
      return { extraction_status: loan.ai_extraction_status, message: 'No extraction result available yet.', extracted_summary: loan.extracted_summary };
    }

    try {
      const response = await aiClient.get(`/api/v1/extraction/result/${loan.app_id}`);
      return response.data?.data;
    } catch (err) {
      logger.warn(`[Extraction] Could not fetch from ai-services: ${err.message}`);
      return { extraction_id: loan.ai_extraction_id, extraction_status: loan.ai_extraction_status, extracted_summary: loan.extracted_summary, fallback: true };
    }
  },

  async handleExtractionComplete(loanId, payload) {
    const loan = await findLoanById(loanId);
    if (!loan) { logger.warn(`handleExtractionComplete: loan ${loanId} not found`); return; }
    await updateLoanExtractionStatus(loanId, payload);
    logger.info(`[Extraction] Loan ${loanId} updated — complete=${payload.is_complete}, confidence=${payload.overall_confidence}`);
  },

  async handleMissingInfo(loanId, payload) {
    const { missing_fields, extraction_id } = payload;
    const loan = await findLoanById(loanId);
    if (!loan) { logger.warn(`handleMissingInfo: loan ${loanId} not found`); return; }

    const transitionable = ['submitted', 'eligibility_check', 'agent_review'];
    if (!transitionable.includes(loan.status)) {
      logger.info(`[Extraction] Loan ${loanId} status=${loan.status} — not transitioning to missing_info`);
      return;
    }

    const fromStatus = loan.status;
    await updateLoanDraft(loanId, { status: 'missing_info', progress: 50, ai_extraction_status: 'partial' });

    const fieldLabels = missing_fields.map(f => FIELD_LABELS[f] || f);
    const notes = `AI extraction identified missing required information.\n\nMissing fields:\n• ${fieldLabels.join('\n• ')}\n\nPlease upload additional documentation.`;

    await createStatusHistory({
      loan_id: loanId, from_status: fromStatus, to_status: 'missing_info',
      changed_by: 'system', changed_by_name: 'AI Extraction Engine', changed_by_model: 'System',
      notes, missing_docs: missing_fields,
    });

    try {
      const smeId = loan.sme_id?.id || loan.sme_id;
      const sme = await findSMEById(smeId);
      if (sme) await EmailService.sendMissingInfoRequest(sme, loan, fieldLabels);
    } catch (emailErr) {
      logger.error(`[Extraction] Failed to send email: ${emailErr.message}`);
    }
  },
};

export default ExtractionService;
