import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';
import BankService from '../services/bank.service.js';
import AuditLog from '../models/auditLog.model.js';

// ---------------------------------------------------------------------------
// Bank Controller
// ---------------------------------------------------------------------------

/**
 * GET /api/v1/banks/accounts
 * Lists all verified bank accounts linked to the SME profile.
 */
export const getLinkedAccounts = asyncHandler(async (req, res) => {
  const accounts = await BankService.getLinkedAccounts(req.user.id);
  return ApiResponse.ok(accounts, 'Linked bank accounts retrieved successfully').send(res);
});

/**
 * POST /api/v1/banks/otp/send
 * Triggers OTP generation for bank verification.
 */
export const sendOtp = asyncHandler(async (req, res) => {
  const result = await BankService.sendOtp(req.user.id, req.body.contact);

  // Record audit log
  AuditLog.record({
    actor_id: req.user.id,
    actor_ref_model: 'SMEUser',
    actor_email: req.user.email,
    action: 'bank.send_otp',
    method: 'POST',
    resource_path: req.originalUrl,
    status: 'success',
    status_code: 200,
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
  }).catch(() => {});

  return ApiResponse.ok(result, 'Verification code sent successfully').send(res);
});

/**
 * POST /api/v1/banks/otp/verify
 * Verifies the OTP and links the bank account.
 */
export const verifyOtpAndLink = asyncHandler(async (req, res) => {
  const account = await BankService.verifyOtpAndLink(req.user.id, req.body);

  // Record audit log
  AuditLog.record({
    actor_id: req.user.id,
    actor_ref_model: 'SMEUser',
    actor_email: req.user.email,
    action: 'bank.verify_and_link',
    method: 'POST',
    resource_path: req.originalUrl,
    resource_id: account._id,
    resource_model: 'BankAccount',
    status: 'success',
    status_code: 201,
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
  }).catch(() => {});

  return ApiResponse.created(account, 'Bank account verified and linked successfully').send(res);
});

/**
 * DELETE /api/v1/banks/accounts/:id
 * Unlinks a linked bank account.
 */
export const unlinkAccount = asyncHandler(async (req, res) => {
  await BankService.unlinkAccount(req.user.id, req.params.id);

  // Record audit log
  AuditLog.record({
    actor_id: req.user.id,
    actor_ref_model: 'SMEUser',
    actor_email: req.user.email,
    action: 'bank.unlink',
    method: 'DELETE',
    resource_path: req.originalUrl,
    resource_id: req.params.id,
    resource_model: 'BankAccount',
    status: 'success',
    status_code: 200,
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
  }).catch(() => {});

  return ApiResponse.ok(null, 'Bank account unlinked successfully').send(res);
});
