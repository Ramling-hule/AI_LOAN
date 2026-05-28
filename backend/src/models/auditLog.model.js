import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// AuditLog Schema
//
// Immutable event log — records every significant action performed
// by any actor in the system. Designed for compliance & debugging.
//
// Design decisions:
//   • No soft-delete: audit logs must never be deleted.
//   • No updates: each event is a write-once document.
//   • actor_ref_model tells us which collection actor_id points to
//     (SMEUser or BankAdminUser).
//
// Relations:
//   AuditLog ──► SMEUser | BankAdminUser  (polymorphic: actor_id + actor_ref_model)
// ---------------------------------------------------------------------------

const auditLogSchema = new mongoose.Schema(
  {
    // ── Primary Key ────────────────────────────────────────────────────────
    _id: {
      type: String,
      default: uuidv4,
    },

    // ── Actor (who did it) ─────────────────────────────────────────────────
    /** UUID of the user who performed the action */
    actor_id: {
      type: String,
      required: [true, 'Actor ID is required'],
      index: true,
    },

    /** Which model the actor_id belongs to (polymorphic reference) */
    actor_ref_model: {
      type: String,
      required: [true, 'Actor reference model is required'],
      enum: {
        values: ['SMEUser', 'BankAdminUser', 'System'],
        message: 'actor_ref_model must be SMEUser, BankAdminUser, or System',
      },
    },

    /** Snapshot of actor email at time of action (denormalized for audit trail stability) */
    actor_email: {
      type: String,
      trim: true,
      lowercase: true,
    },

    // ── Action Details ─────────────────────────────────────────────────────
    /** High-level action category, e.g. "loan.approve", "user.login" */
    action: {
      type: String,
      required: [true, 'Action is required'],
      trim: true,
      maxlength: [100, 'Action must not exceed 100 characters'],
    },

    /** HTTP method or event type, e.g. "POST", "PATCH", "EVENT" */
    method: {
      type: String,
      trim: true,
      uppercase: true,
      enum: {
        values: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'EVENT', 'SYSTEM'],
        message: 'Method must be a valid HTTP verb or EVENT/SYSTEM',
      },
    },

    /** API route or internal event path, e.g. "/api/v1/loans/abc123" */
    resource_path: {
      type: String,
      trim: true,
    },

    // ── Target Resource ────────────────────────────────────────────────────
    /** UUID of the document that was acted upon */
    resource_id: {
      type: String,
      index: true,
    },

    /** Model name of the document that was acted upon, e.g. "Loan", "SMEUser" */
    resource_model: {
      type: String,
      trim: true,
    },

    // ── Change Tracking ────────────────────────────────────────────────────
    /** Snapshot of the document BEFORE the change (partial or full) */
    previous_state: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    /** Snapshot of the document AFTER the change (partial or full) */
    new_state: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // ── Outcome ────────────────────────────────────────────────────────────
    status: {
      type: String,
      required: [true, 'Status is required'],
      enum: {
        values: ['success', 'failure', 'partial'],
        message: 'Status must be success, failure, or partial',
      },
      default: 'success',
    },

    /** HTTP status code or internal error code */
    status_code: {
      type: Number,
    },

    /** Error message if the action failed */
    error_message: {
      type: String,
      trim: true,
    },

    // ── Request Context ────────────────────────────────────────────────────
    /** Client IP address */
    ip_address: {
      type: String,
      trim: true,
    },

    /** User-Agent header */
    user_agent: {
      type: String,
      trim: true,
    },

    /** Correlation ID for tracing across services */
    correlation_id: {
      type: String,
      trim: true,
      index: true,
    },
  },
  {
    _id: false,
    // AuditLogs are write-once: only createdAt is relevant
    timestamps: { createdAt: 'created_at', updatedAt: false },
    versionKey: false,
    // Do not allow updates via save() to enforce immutability
  }
);

// ── Indexes ──────────────────────────────────────────────────────────────────
auditLogSchema.index({ actor_id: 1, created_at: -1 });       // per-user history
auditLogSchema.index({ resource_id: 1, created_at: -1 });     // per-document history
auditLogSchema.index({ action: 1, created_at: -1 });          // per-action type query
auditLogSchema.index({ created_at: -1 });                     // chronological listing
auditLogSchema.index(
  { created_at: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 365 * 2 } // TTL: auto-delete after 2 years
);

// ── Guard: prevent updates ────────────────────────────────────────────────────
auditLogSchema.pre('save', function (next) {
  if (!this.isNew) {
    return next(new Error('AuditLog records are immutable and cannot be updated'));
  }
  next();
});

// ── Static: structured factory ────────────────────────────────────────────────
auditLogSchema.statics.record = function ({
  actor_id,
  actor_ref_model,
  actor_email,
  action,
  method,
  resource_path,
  resource_id,
  resource_model,
  previous_state,
  new_state,
  status = 'success',
  status_code,
  error_message,
  ip_address,
  user_agent,
  correlation_id,
}) {
  return this.create({
    actor_id,
    actor_ref_model,
    actor_email,
    action,
    method,
    resource_path,
    resource_id,
    resource_model,
    previous_state,
    new_state,
    status,
    status_code,
    error_message,
    ip_address,
    user_agent,
    correlation_id,
  });
};

// ── Model ────────────────────────────────────────────────────────────────────
const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export default AuditLog;
