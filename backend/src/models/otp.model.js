import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// OTP Schema
// Stores temporary tokens for verification operations.
// ---------------------------------------------------------------------------

const otpSchema = new mongoose.Schema(
  {
    // ── Primary Key ────────────────────────────────────────────────────────
    _id: {
      type: String,
      default: uuidv4,
    },

    // ── Relation & Contact ──────────────────────────────────────────────────
    sme_id: {
      type: String,
      ref: 'SMEUser',
      required: false,
      index: true,
    },

    contact: {
      type: String,
      required: [true, 'Target contact detail (email or phone) is required'],
      trim: true,
      index: true,
    },

    // ── Verification details ────────────────────────────────────────────────
    code: {
      type: String,
      required: [true, 'Verification code is required'],
      trim: true,
    },

    expires_at: {
      type: Date,
      required: [true, 'Expiration time is required'],
    },

    attempts: {
      type: Number,
      default: 0,
      min: 0,
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

// Add automatic TTL index to remove expired documents
// Note: expires_at is a Date value when Mongoose saves.
otpSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

const OTP = mongoose.model('OTP', otpSchema);

export default OTP;
