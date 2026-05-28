import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// Role Schema
//
// Roles group permissions and are assigned to users.
// This enables fine-grained RBAC: a user has one role,
// and that role holds many permissions.
//
// Relations:
//   Role ──► Permission[] (many-to-many: roles embed permission UUID refs)
//   Role ←── SMEUser.role_id    (one-to-one per user)
//   Role ←── BankAdminUser.role_id (one-to-one per user)
// ---------------------------------------------------------------------------

const roleSchema = new mongoose.Schema(
  {
    // ── Primary Key ────────────────────────────────────────────────────────
    _id: {
      type: String,
      default: uuidv4,
    },

    // ── Core Fields ────────────────────────────────────────────────────────
    /** Unique machine-readable name, e.g. "sme_applicant", "bank_admin" */
    name: {
      type: String,
      required: [true, 'Role name is required'],
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: [80, 'Role name must not exceed 80 characters'],
    },

    /** Human-readable label */
    display_name: {
      type: String,
      required: [true, 'Display name is required'],
      trim: true,
      maxlength: [150, 'Display name must not exceed 150 characters'],
    },

    /** Optional description */
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description must not exceed 500 characters'],
    },

    /** Role scope — whether this role belongs to SME or Bank side */
    scope: {
      type: String,
      required: [true, 'Scope is required'],
      enum: {
        values: ['sme', 'bank', 'system'],
        message: 'Scope must be one of: sme, bank, system',
      },
    },

    // ── RBAC: Permissions ─────────────────────────────────────────────────
    /** References to Permission._id (UUID strings) */
    permissions: [
      {
        type: String,
        ref: 'Permission',
      },
    ],

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
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Indexes ──────────────────────────────────────────────────────────────────
roleSchema.index({ scope: 1 });

// ── Populate helper ───────────────────────────────────────────────────────────
roleSchema.methods.withPermissions = function () {
  return this.populate('permissions');
};

// ── Soft-delete helpers ───────────────────────────────────────────────────────
roleSchema.statics.findActive = function (filter = {}) {
  return this.find({ ...filter, is_deleted: false });
};

roleSchema.methods.softDelete = function () {
  this.is_deleted = true;
  this.deleted_at = new Date();
  return this.save();
};

// ── Model ────────────────────────────────────────────────────────────────────
const Role = mongoose.model('Role', roleSchema);

export default Role;
