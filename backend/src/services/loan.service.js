import { Loan, BankAdminUser, SMEUser, LoanStatusHistory } from '../models/index.js';
import { cloudinary } from '../config/cloudinary.js';
import ApiError from '../utils/ApiError.js';
import logger from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Partner Banks static list
// Served via API to keep it single source of truth in backend.
// ---------------------------------------------------------------------------
const PARTNER_BANKS = [
  { id: 'b1', name: 'State Bank of India', branch: 'Corporate Mumbai', ifsc: 'SBIN0000300', rate: '8.9% - 10.5%', limit: '₹50L', time: '5-7 days' },
  { id: 'b2', name: 'HDFC Bank', branch: 'GIFT City Ahmedabad', ifsc: 'HDFC0000240', rate: '9.2% - 11.2%', limit: '₹1.5Cr', time: '3-4 days' },
  { id: 'b3', name: 'ICICI Bank', branch: 'Bandra Kurla Complex', ifsc: 'ICIC0000004', rate: '9.5% - 11.8%', limit: '₹1Cr', time: '4-5 days' },
  { id: 'b4', name: 'Axis Bank', branch: 'Connaught Place Delhi', ifsc: 'UTIB0000007', rate: '9.4% - 12.0%', limit: '₹75L', time: '3-5 days' },
  { id: 'b5', name: 'Federal Bank', branch: 'Kochi Main', ifsc: 'FDRL0001002', rate: '8.7% - 10.2%', limit: '₹40L', time: '6-8 days' },
];

/**
 * Upload buffer to Cloudinary using upload_stream
 */
const uploadToCloudinary = (fileBuffer, originalName, mimeType) => {
  return new Promise((resolve, reject) => {
    // Generate clean public ID
    const baseName = originalName.split('.')[0].replace(/[^a-zA-Z0-9]/g, '_');
    const folder = 'capitalscale_loan_docs';
    const publicId = `${Date.now()}_${baseName}`;

    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: 'auto',
      },
      (error, result) => {
        if (error) {
          logger.error('Cloudinary Upload Stream Error:', error);
          return reject(error);
        }
        resolve(result);
      }
    );

    stream.end(fileBuffer);
  });
};

/**
 * Delete asset from Cloudinary
 */
const deleteFromCloudinary = (publicId) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(publicId, (error, result) => {
      if (error) {
        logger.error('Cloudinary Destroy Error:', error);
        return reject(error);
      }
      resolve(result);
    });
  });
};

const LoanService = {
  /**
   * Get list of commercial partner banks.
   */
  async getPartnerBanks() {
    logger.info('Fetching list of commercial partner banks');
    return PARTNER_BANKS;
  },

  /**
   * Get all loans matching the user's role and business constraints.
   */
  async getLoans(userContext) {
    logger.info(`Fetching loans for user ${userContext.id} with role ${userContext.role}`);
    
    if (userContext.role === 'sme') {
      // SME sees only their own loans
      return await Loan.find({ sme_id: userContext.id }).sort({ created_at: -1 });
    } else if (userContext.role === 'bank_admin' || userContext.role === 'bank_underwriter') {
      const bankAdmin = await BankAdminUser.findById(userContext.id);
      if (!bankAdmin) {
        throw ApiError.unauthorized('Bank administrator account not found');
      }
      logger.info(`Filtering loans for Bank: ${bankAdmin.bank_name}`);
      return await Loan.find({ bank_name: bankAdmin.bank_name })
        .populate('sme_id', 'full_name business_name phone email address')
        .sort({ created_at: -1 });
    } else if (userContext.role === 'super_admin') {
      return await Loan.find()
        .populate('sme_id', 'full_name business_name phone email address')
        .sort({ created_at: -1 });
    } else {
      throw ApiError.forbidden('Role not authorized to fetch loans');
    }
  },

  /**
   * Create a new draft loan application.
   */
  async createDraft(smeId, data) {
    logger.info(`Creating loan draft for SME user ${smeId}`);
    const { bank_name } = data;

    if (!bank_name) {
      throw ApiError.badRequest('Bank name is required to initialize a draft application');
    }

    const validBank = PARTNER_BANKS.some(b => b.name === bank_name);
    if (!validBank) {
      throw ApiError.badRequest(`Bank "${bank_name}" is not a registered partner lender`);
    }

    // Verify SME exists
    const sme = await SMEUser.findById(smeId);
    if (!sme) {
      throw ApiError.notFound('SME Applicant account not found');
    }

    const draft = await Loan.create({
      sme_id: smeId,
      bank_name,
      status: 'draft',
      progress: 10,
      current_step: 1,
    });

    logger.info(`Loan draft created successfully: ${draft.appId}`);
    return draft;
  },

  /**
   * Save draft values for a specific step.
   */
  async saveDraft(smeId, loanId, data) {
    logger.info(`Saving draft updates for loan ${loanId}`);

    const loan = await Loan.findOne({ _id: loanId, sme_id: smeId });
    if (!loan) {
      throw ApiError.notFound('Draft loan application not found');
    }

    if (loan.status !== 'draft') {
      throw ApiError.badRequest('Cannot edit details once application is submitted');
    }

    // Map properties
    if (data.current_step !== undefined) {
      loan.current_step = data.current_step;
      // Smoothly update progress percentage based on step number
      loan.progress = Math.min(10 + (data.current_step - 1) * 12.5, 90);
    }

    // Loan details
    if (data.amount !== undefined) loan.amount = data.amount;
    if (data.tenure !== undefined) loan.tenure = data.tenure;
    if (data.purpose !== undefined) loan.purpose = data.purpose;
    if (data.revenue !== undefined) loan.revenue = data.revenue;

    // Business details
    if (data.business_info) {
      loan.business_info = {
        ...loan.business_info,
        ...data.business_info,
      };
    }

    // Financial details
    if (data.financial_info) {
      loan.financial_info = {
        ...loan.financial_info,
        ...data.financial_info,
      };
    }

    // Behavioural questions
    if (data.behavioural_questions) {
      loan.behavioural_questions = {
        ...loan.behavioural_questions,
        ...data.behavioural_questions,
      };
    }

    await loan.save();
    return loan;
  },

  /**
   * Upload file to Cloudinary and attach to document key
   */
  async uploadDocument(smeId, loanId, documentType, file) {
    logger.info(`Uploading document type ${documentType} for loan ${loanId}`);

    if (!file) {
      throw ApiError.badRequest('No file provided for upload');
    }

    const loan = await Loan.findOne({ _id: loanId, sme_id: smeId });
    if (!loan) {
      throw ApiError.notFound('Loan application not found');
    }

    if (loan.status !== 'draft' && loan.status !== 'missing_info') {
      throw ApiError.badRequest('Cannot upload documents unless in draft or missing information status');
    }

    // Clean up existing document on Cloudinary if it exists to avoid orphans
    const existingDoc = loan.documents?.[documentType];
    if (existingDoc && existingDoc.public_id) {
      logger.info(`Cleaning up existing Cloudinary file: ${existingDoc.public_id}`);
      await deleteFromCloudinary(existingDoc.public_id).catch(err => {
        logger.warn(`Failed to destroy orphan file ${existingDoc.public_id}: ${err.message}`);
      });
    }

    // Upload new buffer
    const uploadResult = await uploadToCloudinary(file.buffer, file.originalname, file.mimetype);

    // Save in document field
    loan.set(`documents.${documentType}`, {
      url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
      filename: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      uploaded_at: new Date(),
    });

    // If status is missing_info, check if we need to auto-transition to submitted
    if (loan.status === 'missing_info') {
      const lastHistory = await LoanStatusHistory.findOne({
        loan_id: loan._id,
        to_status: 'missing_info',
      }).sort({ created_at: -1 });

      if (lastHistory && lastHistory.missing_docs && lastHistory.missing_docs.length > 0) {
        const allUploaded = lastHistory.missing_docs.every((docKey) => {
          if (docKey === documentType) return true;
          return !!loan.documents?.[docKey]?.url;
        });

        if (allUploaded) {
          logger.info(`All missing documents uploaded for loan ${loanId}. Auto-transitioning to submitted.`);
          loan.status = 'submitted';
          loan.progress = 20;

          const sme = await SMEUser.findById(smeId);
          const authorName = sme ? sme.full_name : 'SME Applicant';

          await LoanStatusHistory.create({
            loan_id: loan._id,
            from_status: 'missing_info',
            to_status: 'submitted',
            changed_by: smeId,
            changed_by_name: authorName,
            changed_by_model: 'SMEUser',
            notes: 'System auto-transition: All requested missing documents successfully uploaded.',
            missing_docs: [],
          });
        }
      }
    }

    await loan.save();
    return loan.documents[documentType];
  },

  /**
   * Delete uploaded document from Cloudinary and clear database field
   */
  async deleteDocument(smeId, loanId, documentType) {
    logger.info(`Deleting document type ${documentType} from loan ${loanId}`);

    const loan = await Loan.findOne({ _id: loanId, sme_id: smeId });
    if (!loan) {
      throw ApiError.notFound('Loan application not found');
    }

    if (loan.status !== 'draft' && loan.status !== 'missing_info') {
      throw ApiError.badRequest('Cannot modify documents unless in draft or missing information status');
    }

    const doc = loan.documents?.[documentType];
    if (!doc) {
      throw ApiError.notFound(`No document found for type: ${documentType}`);
    }

    // Destroy on Cloudinary
    if (doc.public_id) {
      await deleteFromCloudinary(doc.public_id);
    }

    // Remove from DB
    loan.set(`documents.${documentType}`, undefined);
    await loan.save();

    return { message: `Document ${documentType} deleted successfully` };
  },

  /**
   * Validate and finalize submission
   */
  async submitLoanApplication(smeId, loanId) {
    logger.info(`Submitting loan application ${loanId}`);

    const loan = await Loan.findOne({ _id: loanId, sme_id: smeId });
    if (!loan) {
      throw ApiError.notFound('Loan application not found');
    }

    if (loan.status !== 'draft') {
      throw ApiError.badRequest('Application is already submitted');
    }

    // ── VALIDATION CHECKS ────────────────────────────────────────────────────
    // 1. Business Info
    const bi = loan.business_info;
    if (!bi || !bi.legal_name || !bi.registration_type || !bi.gstin || !bi.incorporation_date || !bi.industry_type) {
      throw ApiError.badRequest('Missing business information. Please complete Step 1.');
    }

    // 2. Financial Info
    const fi = loan.financial_info;
    if (!fi || fi.annual_turnover === undefined || fi.net_profit === undefined) {
      throw ApiError.badRequest('Missing financial information. Please complete Step 2.');
    }

    // 3. Loan Details
    if (!loan.bank_name || !loan.amount || !loan.tenure || !loan.purpose || !loan.revenue) {
      throw ApiError.badRequest('Missing loan parameters. Please complete Step 3.');
    }

    // 4. Required uploads check
    const requiredDocs = ['pan', 'aadhaar', 'gst_certificate', 'bank_statements', 'itr', 'balance_sheets', 'profit_loss', 'loan_documents'];
    for (const docKey of requiredDocs) {
      if (!loan.documents?.[docKey]?.url) {
        throw ApiError.badRequest(`Missing required upload: ${docKey.toUpperCase().replace('_', ' ')}. Please upload all documents.`);
      }
    }

    // 5. Behavioural Questions
    const bq = loan.behavioural_questions;
    if (!bq || !bq.business_challenges || !bq.repayment_plan || !bq.future_goals || bq.integrity_check === undefined) {
      throw ApiError.badRequest('Missing behavioural responses. Please complete Step 7.');
    }

    // All checks pass: Transition to pending underwriting
    loan.status = 'submitted';
    loan.progress = 20;
    loan.current_step = 8;
    loan.risk_score = Math.floor(550 + Math.random() * 250); // initial scoring

    const sme = await SMEUser.findById(smeId);
    const authorName = sme ? sme.full_name : 'SME Applicant';

    await LoanStatusHistory.create({
      loan_id: loan._id,
      from_status: 'draft',
      to_status: 'submitted',
      changed_by: smeId,
      changed_by_name: authorName,
      changed_by_model: 'SMEUser',
      notes: 'Initial loan application submission.',
      missing_docs: [],
    });

    await loan.save();
    logger.info(`Loan ${loan.appId} successfully submitted for evaluation`);
    return loan;
  },

  /**
   * Get a single loan application by ID.
   */
  async getLoanById(id, userContext) {
    logger.info(`Fetching loan by ID: ${id}`);
    
    const loan = await Loan.findById(id).populate('sme_id', 'full_name business_name phone email address');
    if (!loan) {
      throw ApiError.notFound('Loan application not found');
    }

    // Authorization checks
    if (userContext.role === 'sme' && loan.sme_id._id !== userContext.id) {
      throw ApiError.forbidden('You are not authorized to view this loan application');
    } else if (userContext.role === 'bank_admin' || userContext.role === 'bank_underwriter') {
      const bankAdmin = await BankAdminUser.findById(userContext.id);
      if (!bankAdmin || bankAdmin.bank_name !== loan.bank_name) {
        throw ApiError.forbidden('You are not authorized to view this loan application');
      }
    }

    return loan;
  },

  /**
   * Update a loan application status or progress (underwriter/bank admin).
   */
  async updateLoan(id, data, userContext) {
    logger.info(`Updating loan ID: ${id} by user: ${userContext.id}`);
    
    const loan = await Loan.findById(id);
    if (!loan) {
      throw ApiError.notFound('Loan application not found');
    }

    // Only bank admins, underwriters or super admins can update status/progress
    if (userContext.role === 'sme') {
      throw ApiError.forbidden('SME applicants cannot update loan details after submission');
    }

    if (userContext.role === 'bank_admin' || userContext.role === 'bank_underwriter') {
      const bankAdmin = await BankAdminUser.findById(userContext.id);
      if (!bankAdmin || bankAdmin.bank_name !== loan.bank_name) {
        throw ApiError.forbidden('You are not authorized to manage applications for another bank');
      }
    }

    const { status, progress, risk_score } = data;

    if (status) loan.status = status;
    if (progress !== undefined) loan.progress = progress;
    if (risk_score !== undefined) loan.risk_score = risk_score;

    await loan.save();
    logger.info(`Loan ${loan.appId} updated successfully: status=${loan.status}, progress=${loan.progress}`);
    return loan;
  },

  /**
   * Delete a loan record.
   */
  async deleteLoan(id, userContext) {
    logger.info(`Deleting loan ID: ${id}`);
    
    if (userContext.role !== 'super_admin') {
      throw ApiError.forbidden('Only super administrators can delete loan records');
    }

    const result = await Loan.findByIdAndDelete(id);
    if (!result) {
      throw ApiError.notFound('Loan application not found');
    }

    logger.info(`Loan record ${id} deleted successfully`);
    return result;
  },

  /**
   * Transition loan application status.
   */
  async transitionLoanStatus(loanId, toStatus, userContext, notes, missingDocs) {
    logger.info(`Transitioning status for loan ${loanId} to ${toStatus} by user ${userContext.id}`);

    const loan = await Loan.findById(loanId);
    if (!loan) {
      throw ApiError.notFound('Loan application not found');
    }

    const fromStatus = loan.status;

    // Define valid transitions and role constraints
    const VALID_TRANSITIONS = {
      draft: {
        next: ['submitted'],
        roles: ['sme'],
      },
      submitted: {
        next: ['eligibility_check', 'rejected'],
        roles: ['bank_admin', 'bank_underwriter', 'super_admin'],
      },
      eligibility_check: {
        next: ['agent_review', 'missing_info', 'rejected'],
        roles: ['bank_admin', 'bank_underwriter', 'super_admin'],
      },
      missing_info: {
        next: ['submitted', 'rejected'],
        roles: ['sme', 'bank_admin', 'bank_underwriter', 'super_admin'],
      },
      agent_review: {
        next: ['approved', 'rejected', 'missing_info'],
        roles: ['bank_admin', 'bank_underwriter', 'super_admin'],
      },
      approved: {
        next: ['disbursed', 'rejected'],
        roles: ['bank_admin', 'bank_underwriter', 'super_admin'],
      },
      rejected: {
        next: [],
        roles: [],
      },
      disbursed: {
        next: [],
        roles: [],
      }
    };

    const allowed = VALID_TRANSITIONS[fromStatus];
    if (!allowed) {
      throw ApiError.badRequest(`Unknown current loan status: ${fromStatus}`);
    }

    if (!allowed.next.includes(toStatus)) {
      throw ApiError.badRequest(`Invalid status transition from ${fromStatus} to ${toStatus}`);
    }

    // Role verification (Super Admin bypassed)
    if (userContext.role !== 'super_admin' && !allowed.roles.includes(userContext.role)) {
      throw ApiError.forbidden(`Your role (${userContext.role}) is not authorized to transition loan from ${fromStatus} to ${toStatus}`);
    }

    // Adjust progress percentages
    const STATUS_PROGRESS = {
      draft: 10,
      submitted: 20,
      eligibility_check: 40,
      agent_review: 60,
      missing_info: 50,
      approved: 90,
      rejected: 100,
      disbursed: 100,
    };

    loan.status = toStatus;
    loan.progress = STATUS_PROGRESS[toStatus] || loan.progress;

    // Get author details
    let authorName = 'System Administrator';
    let authorModel = 'BankAdminUser';

    if (userContext.role === 'sme') {
      const sme = await SMEUser.findById(userContext.id);
      authorName = sme ? sme.full_name : 'SME Applicant';
      authorModel = 'SMEUser';
    } else {
      const admin = await BankAdminUser.findById(userContext.id);
      authorName = admin ? admin.admin_name : 'Bank Officer';
      authorModel = 'BankAdminUser';
    }

    // Save status history entry
    await LoanStatusHistory.create({
      loan_id: loanId,
      from_status: fromStatus,
      to_status: toStatus,
      changed_by: userContext.id,
      changed_by_name: authorName,
      changed_by_model: authorModel,
      notes: notes || '',
      missing_docs: toStatus === 'missing_info' ? (missingDocs || []) : [],
    });

    await loan.save();
    return loan;
  },

  /**
   * Get status history entries for a given loan.
   */
  async getStatusHistory(loanId, userContext) {
    logger.info(`Fetching status history for loan ${loanId}`);

    const loan = await Loan.findById(loanId);
    if (!loan) {
      throw ApiError.notFound('Loan application not found');
    }

    // Auth check
    if (userContext.role === 'sme' && loan.sme_id !== userContext.id) {
      throw ApiError.forbidden('You are not authorized to view logs for this application');
    } else if (userContext.role === 'bank_admin' || userContext.role === 'bank_underwriter') {
      const bankAdmin = await BankAdminUser.findById(userContext.id);
      if (!bankAdmin || bankAdmin.bank_name !== loan.bank_name) {
        throw ApiError.forbidden('You are not authorized to view logs for this application');
      }
    }

    return await LoanStatusHistory.find({ loan_id: loanId }).sort({ created_at: 1 });
  },
};

export default LoanService;
