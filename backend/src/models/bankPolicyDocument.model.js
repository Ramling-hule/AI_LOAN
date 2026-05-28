import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// BankPolicyDocument Schema
// Stores confidential credit directives/policy documents uploaded by bank admins.
// ---------------------------------------------------------------------------

const bankPolicyDocumentSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: uuidv4,
    },
    bank_name: {
      type: String,
      required: [true, 'Bank name is required'],
      trim: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Policy title is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    filename: {
      type: String,
      required: true,
    },
    url: {
      type: String,
      required: true,
    },
    public_id: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      required: true,
    },
    mimetype: {
      type: String,
      required: true,
    },
    uploaded_by: {
      type: String,
      required: true,
      ref: 'BankAdminUser',
    },
    uploaded_by_name: {
      type: String,
      required: true,
    },
    is_system_default: {
      type: Boolean,
      default: false,
    },
    content: {
      type: String,
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

const BankPolicyDocument = mongoose.model('BankPolicyDocument', bankPolicyDocumentSchema);

export default BankPolicyDocument;
