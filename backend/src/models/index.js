// ---------------------------------------------------------------------------
// Models barrel — import all Mongoose models from a single entry point.
//
// Usage:
//   import { SMEUser, BankAdminUser, Role, Permission, AuditLog } from '../models/index.js';
// ---------------------------------------------------------------------------

export { default as SMEUser } from './smeUser.model.js';
export { default as BankAdminUser } from './bankAdminUser.model.js';
export { default as Role } from './role.model.js';
export { default as Permission } from './permission.model.js';
export { default as AuditLog } from './auditLog.model.js';
export { default as Loan } from './loan.model.js';
export { default as BankAccount } from './bankAccount.model.js';
export { default as OTP } from './otp.model.js';
export { default as LoanStatusHistory } from './loanStatusHistory.model.js';
export { default as BankPolicyDocument } from './bankPolicyDocument.model.js';
