import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// BankAccount Schema
// Stores bank accounts linked to an SME user after verification.
// ---------------------------------------------------------------------------

const bankAccountSchema = new mongoose.Schema(
  {
    // ── Primary Key ────────────────────────────────────────────────────────
    _id: {
      type: String,
      default: uuidv4,
    },

    // ── Relations ──────────────────────────────────────────────────────────
    sme_id: {
      type: String,
      ref: 'SMEUser',
      required: [true, 'SME User reference is required'],
      index: true,
    },

    // ── Account Details ────────────────────────────────----------------─────
    bank_name: {
      type: String,
      required: [true, 'Bank name is required'],
      trim: true,
    },

    account_number: {
      type: String,
      required: [true, 'Account number is required'],
      trim: true,
    },

    account_type: {
      type: String,
      enum: ['savings', 'current'],
      default: 'current',
    },

    linked_contact: {
      type: String,
      required: [true, 'Linked email or phone contact is required'],
      trim: true,
    },

    ifsc_code: {
      type: String,
      required: [true, 'IFSC code is required'],
      trim: true,
      uppercase: true,
    },

    is_linked: {
      type: Boolean,
      default: true,
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

const BankAccount = mongoose.model('BankAccount', bankAccountSchema);

export default BankAccount;
