import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// Loan Schema
// Represents a commercial loan application submitted by an SME user.
// ---------------------------------------------------------------------------

const documentMetadataSchema = {
  url: { type: String },
  public_id: { type: String },
  filename: { type: String },
  mimetype: { type: String },
  size: { type: Number },
  uploaded_at: { type: Date, default: Date.now },
};

const loanSchema = new mongoose.Schema(
  {
    // ── Primary Key ────────────────────────────────────────────────────────
    _id: {
      type: String,
      default: uuidv4,
    },

    // ── Unique Application Code ────────────────────────────────────────────
    appId: {
      type: String,
      required: true,
      unique: true,
      default: () => `APP-${Math.floor(1000 + Math.random() * 9000)}`,
      index: true,
    },

    // ── Relations ──────────────────────────────────────────────────────────
    sme_id: {
      type: String,
      ref: 'SMEUser',
      required: [true, 'SME Applicant ID is required'],
      index: true,
    },

    // ── Loan Details ───────────────────────────────────────────────────────
    bank_name: {
      type: String,
      required: [true, 'Lender bank name is required'],
      trim: true,
      index: true,
    },

    amount: {
      type: Number,
      min: [100000, 'Minimum ₹100,000 is required'],
    },

    tenure: {
      type: Number,
    },

    purpose: {
      type: String,
    },

    revenue: {
      type: Number,
    },

    // ── Multi-Step Progress Tracking ────────────────────────────────────────
    current_step: {
      type: Number,
      default: 1,
    },

    // ── Section 1: Business Information ─────────────────────────────────────
    business_info: {
      legal_name: { type: String, trim: true },
      registration_type: {
        type: String,
        enum: ['sole_proprietorship', 'partnership', 'pvt_ltd', 'llp', 'other'],
      },
      gstin: { type: String, trim: true },
      incorporation_date: { type: Date },
      industry_type: { type: String, trim: true },
    },

    // ── Section 2: Financial Information ────────────────────────────────────
    financial_info: {
      annual_turnover: { type: Number },
      net_profit: { type: Number },
      existing_loans_count: { type: Number, default: 0 },
      existing_loan_emi: { type: Number, default: 0 },
    },

    // ── Section 4-6: Uploaded Documents ──────────────────────────────────────
    documents: {
      // KYC Uploads
      pan: documentMetadataSchema,
      aadhaar: documentMetadataSchema,
      gst_certificate: documentMetadataSchema,
      // Financial Documents
      bank_statements: documentMetadataSchema,
      itr: documentMetadataSchema,
      balance_sheets: documentMetadataSchema,
      profit_loss: documentMetadataSchema,
      // Collateral Documents
      loan_documents: documentMetadataSchema,
    },

    // ── Section 7: Behavioural Questions ────────────────────────────────────
    behavioural_questions: {
      business_challenges: { type: String, trim: true },
      repayment_plan: { type: String, trim: true },
      future_goals: { type: String, trim: true },
      integrity_check: { type: Boolean },
    },

    // ── Application State ──────────────────────────────────────────────────
    status: {
      type: String,
      enum: ['draft', 'submitted', 'eligibility_check', 'agent_review', 'missing_info', 'approved', 'rejected', 'disbursed'],
      default: 'draft',
      index: true,
    },

    progress: {
      type: Number,
      default: 10, // 10% progress on draft creation
    },

    risk_score: {
      type: Number,
    },
  },
  {
    _id: false,
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Model ────────────────────────────────────────────────────────────────────
const Loan = mongoose.model('Loan', loanSchema);

export default Loan;
