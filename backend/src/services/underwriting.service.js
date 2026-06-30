import { findBankAdminById } from '../db/queries/users.queries.js';
import { findPoliciesForBank } from '../db/queries/policies.queries.js';
import ExtractionService from './extraction.service.js';
import ApiError from '../utils/ApiError.js';
import logger from '../utils/logger.js';
import aiServiceClient from '../infrastructure/ai/AiServiceClient.js';
import loanRepository from '../repositories/LoanRepository.js';
import EmailService from './email.service.js';

const stripHtml = (html) => (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

class UnderwritingService {
  constructor(aiClient, loanRepo, emailSvc) {
    this.aiClient = aiClient;
    this.loanRepo = loanRepo;
    this.emailSvc = emailSvc;
  }

  async triggerAssessment(loanId, userContext, options = {}) {
    const loan = await this.loanRepo.findById(loanId);
    if (!loan) throw ApiError.notFound('Loan application not found');

    if (userContext.role === 'sme') throw ApiError.forbidden('SME applicants cannot trigger underwriting');

    if (['bank_admin', 'bank_underwriter'].includes(userContext.role)) {
      const admin = await findBankAdminById(userContext.id);
      if (!admin || admin.bank_name !== loan.bank_name) throw ApiError.forbidden('Not authorized for this loan');
    }

    const policies = await findPoliciesForBank(loan.bank_name);
    const policyData = policies.map(p => ({
      id: p.id || p._id,
      title: p.title,
      content: stripHtml(p.content),
    }));

    let assessment;
    try {
      if (options.force) {
        const response = await this.aiClient.preemptQueue(loanId, {
          task_type: 'full_pipeline',
          payload: {
            application_id: loan.app_id,
            requested_amount: loan.amount,
            bank_name: loan.bank_name,
            policies: policyData,
            force: true
          }
        });
        assessment = response.data?.data;
      } else {
        const response = await this.aiClient.assessUnderwriting({
          application_id: loan.app_id,
          loan_id: loanId,
          requested_amount: loan.amount,
          bank_name: loan.bank_name,
          policies: policyData,
          ...options,
        });
        assessment = response.data?.data;
      }
    } catch (err) {
      const aiMsg = err.response?.data?.message || err.response?.data?.detail || err.message;
      throw ApiError.internal(`AI underwriting service error: ${aiMsg}`);
    }

    if (!assessment) throw ApiError.internal('AI underwriting returned an empty assessment.');

    
    if (assessment.status === 'queued' || assessment.job_id) {
      logger.info(`[Underwriting] Assessment queued for loan=${loanId}. Job ID: ${assessment.job_id}`);
      return { loan_id: loanId, status: 'queued', job_id: assessment.job_id };
    }

    const riskScore = assessment.risk_score || loan.risk_score;
    await this.loanRepo.updateUnderwritingAssessment(loanId, assessment, riskScore);

    await this.loanRepo.addStatusHistory({
      loan_id: loanId,
      from_status: loan.status,
      to_status: loan.status,
      changed_by: userContext.id,
      changed_by_name: 'AI Underwriting Engine',
      changed_by_model: 'System',
      notes: `AI Underwriting Assessment complete. Risk: ${assessment.risk_level}. Recommendation: ${assessment.approval_recommendation}. Score: ${riskScore}`,
    });

    logger.info(`[Underwriting] Assessment complete for loan=${loanId}. Risk=${assessment.risk_level}, Recommendation=${assessment.approval_recommendation}`);

    return { loan_id: loanId, assessment };
  }

  async getAssessment(loanId, userContext) {
    const loan = await this.loanRepo.findById(loanId);
    if (!loan) throw ApiError.notFound('Loan application not found');

    if (userContext.role === 'sme') {
      const smeId = loan.sme_id?.id || loan.sme_id;
      if (smeId !== userContext.id) throw ApiError.forbidden('Not authorized');
    }
    if (['bank_admin', 'bank_underwriter'].includes(userContext.role)) {
      const admin = await findBankAdminById(userContext.id);
      if (!admin || admin.bank_name !== loan.bank_name) throw ApiError.forbidden('Not authorized');
    }

    if (!loan.underwriting_assessment) {
      return { message: 'No underwriting assessment has been run for this loan yet.' };
    }

    return {
      loan_id: loanId,
      assessment: loan.underwriting_assessment,
      risk_score: loan.risk_score,
    };
  }

  async notifyPolicyIssue(loanId, policyTitle, details, userContext) {
    const loan = await this.loanRepo.findById(loanId);
    if (!loan) throw ApiError.notFound('Loan application not found');

    const fromStatus = loan.status;

    const updatedLoan = await this.loanRepo.updateDraft(loanId, { status: 'missing_info', progress: 50 });

    const notes = `Compliance Issue: Policy "${policyTitle}" is not satisfied.\nDetails: ${details}`;
    await this.loanRepo.addStatusHistory({
      loan_id: loanId,
      from_status: fromStatus,
      to_status: 'missing_info',
      changed_by: userContext.id,
      changed_by_name: userContext.admin_name || 'Bank Admin',
      changed_by_model: 'BankAdminUser',
      notes,
    });

    if (loan.sme_id?.email) {
      const html = `
        <h3>Dear ${loan.sme_id.full_name},</h3>
        <p>We are reviewing your loan application <strong>${loan.app_id}</strong>.</p>
        <p>Our underwriting team has flagged a policy compliance issue that requires your attention:</p>
        <div style="background-color: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; border-radius: 5px; color: #721c24; margin: 15px 0;">
          <strong>Policy: ${policyTitle}</strong><br/>
          ${details}
        </div>
        <p>Please log in to your dashboard to address this issue or upload supporting documents.</p>
        <p>Best regards,<br/>CapitalScale Underwriting Team</p>
      `;
      try {
        await this.emailSvc.sendEmail({
          to: loan.sme_id.email,
          subject: `URGENT: Policy Compliance Issue on Loan Application ${loan.app_id}`,
          html,
        });
      } catch (emailErr) {
        logger.error(`[Underwriting] Failed to send policy issue email: ${emailErr.message}`);
      }
    }

    return updatedLoan;
  }

  async getQueueJobStatus(jobId) {
    try {
      const response = await this.aiClient.getQueueJobStatus(jobId);
      return response.data?.data;
    } catch (err) {
      if (err.response?.status === 404) return null;
      logger.error(`[Underwriting] Error fetching AI queue job status: ${err.message}`, err.response?.data);
      throw ApiError.internal('Failed to fetch AI queue job status');
    }
  }
}

export default new UnderwritingService(aiServiceClient, loanRepository, EmailService);
