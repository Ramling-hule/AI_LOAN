import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// SMEUser Schema
//
// Represents an SME (Small & Medium Enterprise) loan applicant.
//
// Relations:
//   SMEUser ──► Role          (role_id → Role._id)
//   SMEUser ←── AuditLog[]   (actor_id on AuditLog references SMEUser._id)
// ---------------------------------------------------------------------------

const smeUserSchema = new mongoose.Schema(
  {
    // ── Primary Key ────────────────────────────────────────────────────────
    _id: {
      type: String,
      default: uuidv4,
    },

    // ── Personal & Business Details ────────────────────────────────────────
    full_name: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      minlength: [2, 'Full name must be at least 2 characters'],
      maxlength: [150, 'Full name must not exceed 150 characters'],
    },

    business_name: {
      type: String,
      required: [true, 'Business name is required'],
      trim: true,
      minlength: [2, 'Business name must be at least 2 characters'],
      maxlength: [200, 'Business name must not exceed 200 characters'],
    },

    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      match: [/^\+?[1-9]\d{7,14}$/, 'Please provide a valid phone number'],
    },

    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },

    address: {
      street: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      pincode: { type: String, trim: true },
      country: { type: String, trim: true, default: 'India' },
    },

    // ── Authentication ─────────────────────────────────────────────────────
    /** bcrypt hash — NEVER store plain-text passwords */
    password_hash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: false, // excluded from query results by default
    },

    // ── RBAC ──────────────────────────────────────────────────────────────
    /** FK → Role._id (UUID string) */
    role_id: {
      type: String,
      ref: 'Role',
      required: [true, 'Role is required'],
    },

    // ── Account Status ─────────────────────────────────────────────────────
    is_verified: {
      type: Boolean,
      default: false,
    },

    is_active: {
      type: Boolean,
      default: true,
      index: true,
    },

    email_verified_at: {
      type: Date,
      default: null,
    },

    last_login_at: {
      type: Date,
      default: null,
    },

    // ── Soft Delete ────────────────────────────────────────────────────────
    is_deleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deleted_at: {
      type: Date,
      default: null,
    },
  },
  {
    _id: false,
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        // Always strip password_hash from serialized output
        delete ret.password_hash;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// ── Indexes ──────────────────────────────────────────────────────────────────
smeUserSchema.index({ phone: 1 });
smeUserSchema.index({ role_id: 1 });
smeUserSchema.index({ is_active: 1, is_deleted: 1 });
smeUserSchema.index({ business_name: 'text', full_name: 'text' }); // full-text search

// ── Virtual: full address string ──────────────────────────────────────────────
smeUserSchema.virtual('full_address').get(function () {
  const a = this.address;
  if (!a) return '';
  return [a.street, a.city, a.state, a.pincode, a.country].filter(Boolean).join(', ');
});

// ── Soft-delete helpers ───────────────────────────────────────────────────────
smeUserSchema.statics.findActive = function (filter = {}) {
  return this.find({ ...filter, is_deleted: false });
};

smeUserSchema.methods.softDelete = function () {
  this.is_deleted = true;
  this.deleted_at = new Date();
  this.is_active = false;
  return this.save();
};

// ── Model ────────────────────────────────────────────────────────────────────
const SMEUser = mongoose.model('SMEUser', smeUserSchema);

export default SMEUser;
