import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// BankAdminUser Schema
//
// Represents a bank-side admin / underwriter / officer who reviews
// and manages loan applications submitted by SME users.
//
// Relations:
//   BankAdminUser ──► Role       (role_id → Role._id)
//   BankAdminUser ←── AuditLog[] (actor_id on AuditLog references BankAdminUser._id)
// ---------------------------------------------------------------------------

const bankAdminUserSchema = new mongoose.Schema(
  {
    // ── Primary Key ────────────────────────────────────────────────────────
    _id: {
      type: String,
      default: uuidv4,
    },

    // ── Bank & Branch Info ─────────────────────────────────────────────────
    bank_name: {
      type: String,
      required: [true, 'Bank name is required'],
      trim: true,
      maxlength: [200, 'Bank name must not exceed 200 characters'],
    },

    branch_name: {
      type: String,
      required: [true, 'Branch name is required'],
      trim: true,
      maxlength: [200, 'Branch name must not exceed 200 characters'],
    },

    branch_address: {
      street: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      pincode: { type: String, trim: true },
      country: { type: String, trim: true, default: 'India' },
    },

    /** IFSC / bank branch code */
    ifsc_code: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: [11, 'IFSC code must not exceed 11 characters'],
    },

    // ── Admin Personal Details ─────────────────────────────────────────────
    admin_name: {
      type: String,
      required: [true, 'Admin name is required'],
      trim: true,
      minlength: [2, 'Admin name must be at least 2 characters'],
      maxlength: [150, 'Admin name must not exceed 150 characters'],
    },

    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },

    phone: {
      type: String,
      trim: true,
      match: [/^\+?[1-9]\d{7,14}$/, 'Please provide a valid phone number'],
    },

    // ── Authentication ─────────────────────────────────────────────────────
    /** bcrypt hash — NEVER store plain-text passwords */
    password_hash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: false,
    },

    // ── RBAC ──────────────────────────────────────────────────────────────
    /** FK → Role._id (UUID string) */
    role_id: {
      type: String,
      ref: 'Role',
      required: [true, 'Role is required'],
    },

    // ── Account Status ─────────────────────────────────────────────────────
    is_active: {
      type: Boolean,
      default: true,
      index: true,
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
        delete ret.password_hash;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// ── Indexes ──────────────────────────────────────────────────────────────────
bankAdminUserSchema.index({ bank_name: 1 });
bankAdminUserSchema.index({ role_id: 1 });
bankAdminUserSchema.index({ is_active: 1, is_deleted: 1 });
bankAdminUserSchema.index({ bank_name: 'text', admin_name: 'text' }); // full-text search

// ── Virtual: full branch address string ───────────────────────────────────────
bankAdminUserSchema.virtual('full_branch_address').get(function () {
  const a = this.branch_address;
  if (!a) return '';
  return [a.street, a.city, a.state, a.pincode, a.country].filter(Boolean).join(', ');
});

// ── Soft-delete helpers ───────────────────────────────────────────────────────
bankAdminUserSchema.statics.findActive = function (filter = {}) {
  return this.find({ ...filter, is_deleted: false });
};

bankAdminUserSchema.methods.softDelete = function () {
  this.is_deleted = true;
  this.deleted_at = new Date();
  this.is_active = false;
  return this.save();
};

// ── Model ────────────────────────────────────────────────────────────────────
const BankAdminUser = mongoose.model('BankAdminUser', bankAdminUserSchema);

export default BankAdminUser;
