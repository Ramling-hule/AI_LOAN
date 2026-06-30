import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';
import {
  registerSME,
  loginSME,
  registerBankAdmin,
  loginBankAdmin,
  verifyMfaOTP,
  refreshAccessToken,
  logout as authServiceLogout,
} from '../services/auth.service.js';
import { setRefreshTokenCookie, clearRefreshTokenCookie } from '../utils/token.utils.js';
import { recordAuditLog } from '../db/queries/auditLogs.queries.js';









export const smeRegister = asyncHandler(async (req, res) => {
  const result = await registerSME(req.body, req.ip, req.headers['user-agent']);

  
  recordAuditLog({
    actor_id: result.user.id,
    actor_ref_model: 'SMEUser',
    actor_email: result.user.email,
    action: 'auth.register',
    method: 'POST',
    resource_path: req.originalUrl,
    resource_id: result.user.id,
    resource_model: 'SMEUser',
    status: 'success',
    status_code: 201,
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
  }).catch(() => {});

  return ApiResponse.created(
    { mfaRequired: result.mfaRequired, tempToken: result.tempToken, user: result.user },
    'SME account registered. Please verify MFA OTP code sent to your email.'
  ).send(res);
});


export const smeLogin = asyncHandler(async (req, res) => {
  const result = await loginSME(req.body);
  return ApiResponse.ok(
    { mfaRequired: result.mfaRequired, tempToken: result.tempToken },
    'Credentials verified. Please enter the OTP code sent to your email.'
  ).send(res);
});




export const bankAdminRegister = asyncHandler(async (req, res) => {
  const result = await registerBankAdmin(req.body);

  recordAuditLog({
    actor_id: result.user.id,
    actor_ref_model: 'BankAdminUser',
    actor_email: result.user.email,
    action: 'auth.register',
    method: 'POST',
    resource_path: req.originalUrl,
    resource_id: result.user.id,
    resource_model: 'BankAdminUser',
    status: 'success',
    status_code: 201,
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
  }).catch(() => {});

  return ApiResponse.created(
    { mfaRequired: result.mfaRequired, tempToken: result.tempToken, user: result.user },
    'Bank admin account registered. Please verify MFA OTP code sent to your email.'
  ).send(res);
});


export const bankAdminLogin = asyncHandler(async (req, res) => {
  const result = await loginBankAdmin(req.body);
  return ApiResponse.ok(
    { mfaRequired: result.mfaRequired, tempToken: result.tempToken },
    'Credentials verified. Please enter the OTP code sent to your email.'
  ).send(res);
});




export const verifyMfa = asyncHandler(async (req, res) => {
  const { tempToken, code } = req.body;

  const result = await verifyMfaOTP(tempToken, code, req.ip, req.headers['user-agent']);

  
  setRefreshTokenCookie(res, result.refreshToken);

  recordAuditLog({
    actor_id: result.user.id,
    actor_ref_model: result.user.role === 'sme' ? 'SMEUser' : 'BankAdminUser',
    actor_email: result.user.email,
    action: 'auth.mfa_success',
    method: 'POST',
    resource_path: req.originalUrl,
    status: 'success',
    status_code: 200,
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
  }).catch(() => {});

  return ApiResponse.ok(
    { user: result.user, accessToken: result.accessToken },
    'Login successful and session established'
  ).send(res);
});




export const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken || req.body?.refreshToken;

  const result = await refreshAccessToken(token, req.ip, req.headers['user-agent']);

  
  setRefreshTokenCookie(res, result.refreshToken);

  return ApiResponse.ok(
    { accessToken: result.accessToken },
    'Token refreshed'
  ).send(res);
});


export const logout = asyncHandler(async (req, res) => {
  await authServiceLogout(req.user);

  clearRefreshTokenCookie(res);

  if (req.user) {
    recordAuditLog({
      actor_id: req.user.id,
      actor_ref_model: req.user.role === 'sme' ? 'SMEUser' : 'BankAdminUser',
      actor_email: req.user.email,
      action: 'auth.logout',
      method: 'POST',
      resource_path: req.originalUrl,
      status: 'success',
      status_code: 200,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    }).catch(() => {});
  }

  return ApiResponse.ok(null, 'Logged out successfully').send(res);
});


export const getMe = asyncHandler(async (req, res) => {
  return ApiResponse.ok(req.user, 'Current user').send(res);
});
