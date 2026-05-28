import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const loanStatusHistorySchema = new mongoose.Schema(
  {
    // ── Primary Key ────────────────────────────────────────────────────────
    _id: {
      type: String,
      default: uuidv4,
    },

    // ── Relations ──────────────────────────────────────────────────────────
    loan_id: {
      type: String,
      ref: 'Loan',
      required: [true, 'Loan ID reference is required'],
      index: true,
    },

    // ── Transition Details ──────────────────────────────────────────────────
    from_status: {
      type: String,
      required: [true, 'From status is required'],
    },

    to_status: {
      type: String,
      required: [true, 'To status is required'],
    },

    // ── Transition Author ───────────────────────────────────────────────────
    changed_by: {
      type: String,
      required: [true, 'Author ID is required'],
      index: true,
    },

    changed_by_name: {
      type: String,
      required: [true, 'Author name is required'],
      trim: true,
    },

    changed_by_model: {
      type: String,
      required: [true, 'Author user model type is required'],
      enum: ['SMEUser', 'BankAdminUser'],
    },

    // ── Administrative Metadata ─────────────────────────────────────────────
    notes: {
      type: String,
      trim: true,
      default: '',
    },

    missing_docs: {
      type: [String],
      default: [],
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

const LoanStatusHistory = mongoose.model('LoanStatusHistory', loanStatusHistorySchema);

export default LoanStatusHistory;
