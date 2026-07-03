import {
  createLoan, findLoanById, findLoans, updateLoanDraft, setLoanDocument, removeDocument,
  deleteLoan, createStatusHistory, getStatusHistory, getLastMissingInfoHistory,
} from '../db/queries/loans.queries.js';
import { findSMEById, findBankAdminById, findBankAdminsByBankName, searchSMEUsers, getRegisteredBanks } from '../db/queries/users.queries.js';
import { findOcrJobById, markOcrJobVectorized } from '../db/queries/ocrJobs.queries.js';
import { deleteChunksBySourceDocument } from '../db/queries/embeddings.queries.js';
import { getLatestPolicyForBank } from '../db/queries/policies.queries.js';
import { cloudinary } from '../config/cloudinary.js';
import ApiError from '../utils/ApiError.js';
import logger from '../utils/logger.js';
import OcrService from './ocr.service.js';
import EmailService from './email.service.js';
import ExtractionService from './extraction.service.js';






const STATUS_PROGRESS = {
  draft: 10, submitted: 20, eligibility_check: 40,
  agent_review: 60, missing_info: 50, approved: 90,
  rejected: 100, disbursed: 100,
};

const VALID_TRANSITIONS = {
  draft:            { next: ['submitted'],                                         roles: ['sme'] },
  submitted:        { next: ['eligibility_check', 'rejected'],                     roles: ['bank_admin', 'bank_underwriter', 'super_admin'] },
  eligibility_check:{ next: ['agent_review', 'missing_info', 'rejected'],          roles: ['bank_admin', 'bank_underwriter', 'super_admin'] },
  missing_info:     { next: ['submitted', 'rejected'],                             roles: ['sme', 'bank_admin', 'bank_underwriter', 'super_admin'] },
  agent_review:     { next: ['approved', 'rejected', 'missing_info'],              roles: ['bank_admin', 'bank_underwriter', 'super_admin'] },
  approved:         { next: ['disbursed', 'rejected'],                             roles: ['bank_admin', 'bank_underwriter', 'super_admin'] },
  rejected:         { next: [],                                                    roles: [] },
  disbursed:        { next: [],                                                    roles: [] },
};



const uploadToCloudinary = (fileBuffer, originalName) =>
  new Promise((resolve, reject) => {
    const baseName = originalName.split('.')[0].replace(/[^a-zA-Z0-9]/g, '_');
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'capitalscale_loan_docs', public_id: `${Date.now()}_${baseName}`, resource_type: 'auto' },
      (err, result) => err ? reject(err) : resolve(result)
    );
    stream.end(fileBuffer);
  });

const deleteFromCloudinary = (publicId) =>
  new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(publicId, (err, result) => err ? reject(err) : resolve(result));
  });



const LoanService = {

  async getPartnerBanks() {
    // Fetch all distinct registered banks from the DB
    const banks = await getRegisteredBanks();

    // For each bank, fetch their latest policy in parallel
    const withPolicies = await Promise.all(
      banks.map(async (b, index) => {
        const latestPolicy = await getLatestPolicyForBank(b.bank_name);
        return {
          id: b.id,
          name: b.bank_name,
          branch: b.branch_name || 'Main Branch',
          ifsc: b.ifsc_code || 'N/A',
          // These fields may not exist in DB; provide sensible defaults
          rate: 'Contact Bank',
          limit: 'Contact Bank',
          time: 'Contact Bank',
          latest_policy: latestPolicy
            ? {
                id: latestPolicy.id,
                title: latestPolicy.title,
                filename: latestPolicy.filename,
                url: latestPolicy.url,
                uploaded_at: latestPolicy.created_at,
              }
            : null,
        };
      })
    );

    return withPolicies;
  },

  async createLoan(smeId, data) {
    const sme = await findSMEById(smeId);
    if (!sme) throw ApiError.notFound('SME Applicant account not found');
    
    
    const loan = await createLoan({ sme_id: smeId, ...data });
    logger.info(`Legacy loan application created: ${loan.id}`);
    return loan;
  },

  async getLoans(userContext, queryParams = {}) {
    let filters = {};

    if (userContext.role === 'sme') {
      filters.sme_id = userContext.id;
    } else if (userContext.role === 'bank_admin' || userContext.role === 'bank_underwriter') {
      const admin = await findBankAdminById(userContext.id);
      if (!admin) throw ApiError.unauthorized('Bank administrator account not found');
      filters.bank_name = admin.bank_name;
    } else if (userContext.role !== 'super_admin') {
      throw ApiError.forbidden('Role not authorized to fetch loans');
    }

    if (queryParams.status && queryParams.status !== 'all') filters.status = queryParams.status;
    if (queryParams.search) filters.search = queryParams.search;

    return findLoans({
      ...filters,
      page: parseInt(queryParams.page) || 1,
      limit: parseInt(queryParams.limit) || 10,
    });
  },

  async createDraft(smeId, data) {
    const { bank_name } = data;
    if (!bank_name) throw ApiError.badRequest('Bank name is required');

    const sme = await findSMEById(smeId);
    if (!sme) throw ApiError.notFound('SME Applicant account not found');

    // Validate bank exists in the registered bank list (DB-backed)
    const registeredBanks = await getRegisteredBanks();
    const validBank = registeredBanks.some(b => b.bank_name === bank_name);
    if (!validBank) throw ApiError.badRequest(`Bank "${bank_name}" is not a registered partner lender`);

    const draft = await createLoan({ sme_id: smeId, bank_name });
    logger.info(`Loan draft created: ${draft.app_id}`);
    return draft;
  },

  async saveDraft(smeId, loanId, data) {
    const loan = await findLoanById(loanId);
    if (!loan || loan.sme_id?.id !== smeId && loan.sme_id !== smeId) throw ApiError.notFound('Draft loan application not found');
    if (loan.status !== 'draft') throw ApiError.badRequest('Cannot edit details once application is submitted');

    if (data.current_step !== undefined) {
      data.progress = Math.round(Math.min(10 + (data.current_step - 1) * 12.5, 90));
    }

    return updateLoanDraft(loanId, data);
  },

  async uploadDocument(smeId, loanId, documentType, file) {
    if (!file) throw ApiError.badRequest('No file provided for upload');

    const loan = await findLoanById(loanId);
    const loanSmeId = loan?.sme_id?.id || loan?.sme_id;
    if (!loan || loanSmeId !== smeId) throw ApiError.notFound('Loan application not found');
    if (!['draft', 'missing_info'].includes(loan.status)) throw ApiError.badRequest('Cannot upload documents in current status');

    
    const existingDoc = loan.documents?.[documentType];
    if (existingDoc?.public_id) {
      await deleteFromCloudinary(existingDoc.public_id).catch(err => logger.warn(`Cloudinary cleanup: ${err.message}`));
    }
    if (existingDoc?.ocr_job_id) {
      await deleteChunksBySourceDocument(existingDoc.ocr_job_id).catch(err => logger.warn(`pgvector cleanup: ${err.message}`));
    }

    const uploadResult = await uploadToCloudinary(file.buffer, file.originalname);

    
    let ocrJobId = null;
    try {
      const sme = await findSMEById(smeId);
      const ocrJob = await OcrService.submitJob({
        fileBuffer: file.buffer,
        filename: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        submittedBy: smeId,
        submittedByName: sme?.full_name || 'SME Applicant',
        applicationId: loan.app_id,
        documentType,
        documentUrl: uploadResult.secure_url,
      });
      ocrJobId = ocrJob.job_id;
    } catch (err) {
      logger.error(`Failed to trigger OCR: ${err.message}`);
    }

    const docData = {
      url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
      filename: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      uploaded_at: new Date(),
      ocr_job_id: ocrJobId,
    };

    await setLoanDocument(loanId, documentType, docData);

    
    if (loan.status === 'missing_info') {
      const lastHistory = await getLastMissingInfoHistory(loanId);
      if (lastHistory?.missing_docs?.length > 0) {
        const updatedLoan = await findLoanById(loanId);
        const allUploaded = lastHistory.missing_docs.every(key =>
          key === documentType || !!updatedLoan.documents?.[key]?.url
        );

        if (allUploaded) {
          await updateLoanDraft(loanId, { status: 'submitted', progress: 20 });
          const sme = await findSMEById(smeId);
          await createStatusHistory({
            loan_id: loanId, from_status: 'missing_info', to_status: 'submitted',
            changed_by: smeId, changed_by_name: sme?.full_name || 'SME Applicant',
            changed_by_model: 'SMEUser',
            notes: 'System auto-transition: All missing documents uploaded.',
          });
          const admins = await findBankAdminsByBankName(loan.bank_name);
          for (const admin of admins) {
            await EmailService.sendMissingInfoCompleted(admin, loan).catch(() => {});
          }
        }
      }
    }

    return docData;
  },

  async deleteDocument(smeId, loanId, documentType) {
    const loan = await findLoanById(loanId);
    const loanSmeId = loan?.sme_id?.id || loan?.sme_id;
    if (!loan || loanSmeId !== smeId) throw ApiError.notFound('Loan application not found');
    if (!['draft', 'missing_info'].includes(loan.status)) throw ApiError.badRequest('Cannot modify documents in current status');

    const doc = loan.documents?.[documentType];
    if (!doc) throw ApiError.notFound(`No document found for type: ${documentType}`);

    if (doc.public_id) await deleteFromCloudinary(doc.public_id);
    await removeDocument(loanId, documentType);
    return { message: `Document ${documentType} deleted successfully` };
  },

  async submitLoanApplication(smeId, loanId) {
    const loan = await findLoanById(loanId);
    const loanSmeId = loan?.sme_id?.id || loan?.sme_id;
    if (!loan || loanSmeId !== smeId) throw ApiError.notFound('Loan application not found');
    if (loan.status !== 'draft') throw ApiError.badRequest('Application is already submitted');

    
    const bi = loan.business_info;
    if (!bi?.legal_name || !bi?.registration_type || !bi?.gstin || !bi?.incorporation_date || !bi?.industry_type)
      throw ApiError.badRequest('Missing business information. Please complete Step 1.');

    const fi = loan.financial_info;
    if (!fi || fi.annual_turnover === undefined || fi.net_profit === undefined)
      throw ApiError.badRequest('Missing financial information. Please complete Step 2.');

    if (!loan.bank_name || !loan.amount || !loan.tenure || !loan.purpose)
      throw ApiError.badRequest('Missing loan parameters. Please complete Step 3.');

    const requiredDocs = ['pan', 'aadhaar', 'gst_certificate', 'bank_statements', 'itr', 'balance_sheets', 'profit_loss', 'loan_documents'];
    for (const docKey of requiredDocs) {
      if (!loan.documents?.[docKey]?.url)
        throw ApiError.badRequest(`Missing required upload: ${docKey.toUpperCase().replace('_', ' ')}`);
    }

    const bq = loan.behavioural_questions;
    if (!bq?.business_challenges || !bq?.repayment_plan || !bq?.future_goals || bq.integrity_check === undefined)
      throw ApiError.badRequest('Missing behavioural responses. Please complete Step 7.');

    const riskScore = Math.floor(550 + Math.random() * 250);
    await updateLoanDraft(loanId, { status: 'submitted', progress: 20, current_step: 8, risk_score: riskScore });

    const sme = await findSMEById(smeId);
    await createStatusHistory({
      loan_id: loanId, from_status: 'draft', to_status: 'submitted',
      changed_by: smeId, changed_by_name: sme?.full_name || 'SME Applicant',
      changed_by_model: 'SMEUser', notes: 'Initial loan application submission.',
    });

    return findLoanById(loanId);
  },

  async getLoanById(id, userContext) {
    const loan = await findLoanById(id);
    if (!loan) throw ApiError.notFound('Loan application not found');

    const loanSmeId = loan.sme_id?.id || loan.sme_id;
    if (userContext.role === 'sme' && loanSmeId !== userContext.id)
      throw ApiError.forbidden('Not authorized to view this loan');

    if (['bank_admin', 'bank_underwriter'].includes(userContext.role)) {
      const admin = await findBankAdminById(userContext.id);
      if (!admin || admin.bank_name !== loan.bank_name) throw ApiError.forbidden('Not authorized to view this loan');
    }
    return loan;
  },

  async updateLoan(id, data, userContext) {
    const loan = await findLoanById(id);
    if (!loan) throw ApiError.notFound('Loan application not found');
    if (userContext.role === 'sme') throw ApiError.forbidden('SME applicants cannot update loan details after submission');

    if (['bank_admin', 'bank_underwriter'].includes(userContext.role)) {
      const admin = await findBankAdminById(userContext.id);
      if (!admin || admin.bank_name !== loan.bank_name) throw ApiError.forbidden('Not authorized');
    }

    return updateLoanDraft(id, { status: data.status, progress: data.progress, risk_score: data.risk_score });
  },

  async deleteLoan(id, userContext) {
    if (userContext.role !== 'super_admin') throw ApiError.forbidden('Only super administrators can delete loan records');
    const result = await deleteLoan(id);
    if (!result) throw ApiError.notFound('Loan application not found');
    return result;
  },

  async transitionLoanStatus(loanId, toStatus, userContext, notes, missingDocs) {
    const loan = await findLoanById(loanId);
    if (!loan) throw ApiError.notFound('Loan application not found');

    const fromStatus = loan.status;
    const allowed = VALID_TRANSITIONS[fromStatus];
    if (!allowed) throw ApiError.badRequest(`Unknown current loan status: ${fromStatus}`);
    if (!allowed.next.includes(toStatus)) throw ApiError.badRequest(`Invalid transition: ${fromStatus} → ${toStatus}`);
    if (userContext.role !== 'super_admin' && !allowed.roles.includes(userContext.role))
      throw ApiError.forbidden(`Role '${userContext.role}' cannot transition from ${fromStatus} to ${toStatus}`);

    await updateLoanDraft(loanId, { status: toStatus, progress: STATUS_PROGRESS[toStatus] || loan.progress });

    let authorName = 'System Administrator';
    let authorModel = 'BankAdminUser';
    if (userContext.role === 'sme') {
      const sme = await findSMEById(userContext.id);
      authorName = sme?.full_name || 'SME Applicant';
      authorModel = 'SMEUser';
    } else {
      const admin = await findBankAdminById(userContext.id);
      authorName = admin?.admin_name || 'Bank Officer';
    }

    await createStatusHistory({
      loan_id: loanId, from_status: fromStatus, to_status: toStatus,
      changed_by: userContext.id, changed_by_name: authorName,
      changed_by_model: authorModel, notes: notes || '',
      missing_docs: toStatus === 'missing_info' ? (missingDocs || []) : [],
    });

    
    try {
      if (toStatus === 'missing_info') {
        const sme = await findSMEById(loan.sme_id?.id || loan.sme_id);
        if (sme) await EmailService.sendMissingInfoRequest(sme, loan, missingDocs || []);
      }
    } catch (emailErr) {
      logger.error(`Failed to send transition email: ${emailErr.message}`);
    }

    return findLoanById(loanId);
  },

  async getStatusHistory(loanId, userContext) {
    const loan = await findLoanById(loanId);
    if (!loan) throw ApiError.notFound('Loan application not found');

    const loanSmeId = loan.sme_id?.id || loan.sme_id;
    if (userContext.role === 'sme' && loanSmeId !== userContext.id) throw ApiError.forbidden('Not authorized');

    if (['bank_admin', 'bank_underwriter'].includes(userContext.role)) {
      const admin = await findBankAdminById(userContext.id);
      if (!admin || admin.bank_name !== loan.bank_name) throw ApiError.forbidden('Not authorized');
    }

    return getStatusHistory(loanId);
  },
};

export default LoanService;
