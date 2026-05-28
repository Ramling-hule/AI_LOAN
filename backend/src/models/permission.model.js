import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// Permission Schema
//
// Permissions are the atomic RBAC building blocks. Each permission
// represents a single action on a resource (e.g. "create:loan").
//
// Relations:
//   Permission ←── Role (many-to-many via Role.permissions[])
// ---------------------------------------------------------------------------

const permissionSchema = new mongoose.Schema(
  {
    // ── Primary Key ────────────────────────────────────────────────────────
    _id: {
      type: String,
      default: uuidv4,
    },

    // ── Core Fields ────────────────────────────────────────────────────────
    /** Machine-readable unique key, e.g. "loan:create", "user:read" */
    name: {
      type: String,
      required: [true, 'Permission name is required'],
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: [100, 'Permission name must not exceed 100 characters'],
    },

    /** Human-readable label shown in admin UIs */
    display_name: {
      type: String,
      required: [true, 'Display name is required'],
      trim: true,
      maxlength: [150, 'Display name must not exceed 150 characters'],
    },

    /** Brief description of what this permission allows */
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description must not exceed 500 characters'],
    },

    /** Resource being guarded, e.g. "loan", "user", "report" */
    resource: {
      type: String,
      required: [true, 'Resource is required'],
      trim: true,
      lowercase: true,
    },

    /** Action allowed on the resource, e.g. "create", "read", "update", "delete" */
    action: {
      type: String,
      required: [true, 'Action is required'],
      trim: true,
      lowercase: true,
      enum: {
        values: ['create', 'read', 'update', 'delete', 'approve', 'reject', 'export', 'manage'],
        message: 'Action must be one of: create, read, update, delete, approve, reject, export, manage',
      },
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
    // Use string UUIDs as _id; disable default ObjectId generation
    _id: false,
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Indexes ──────────────────────────────────────────────────────────────────
permissionSchema.index({ resource: 1, action: 1 }, { unique: true });

// ── Soft-delete query helper ──────────────────────────────────────────────────
permissionSchema.statics.findActive = function (filter = {}) {
  return this.find({ ...filter, is_deleted: false });
};

permissionSchema.methods.softDelete = function () {
  this.is_deleted = true;
  this.deleted_at = new Date();
  return this.save();
};

// ── Model ────────────────────────────────────────────────────────────────────
const Permission = mongoose.model('Permission', permissionSchema);

export default Permission;
