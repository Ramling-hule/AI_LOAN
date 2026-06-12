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
import AuditLog from '../models/auditLog.model.js';
import { generateCsrfToken } from '../middleware/csrf.js';
import { recordLoginFailure, clearLoginFailures } from '../middleware/fraud.js';

// ---------------------------------------------------------------------------
// Auth Controller
// Thin layer: validate input → delegate to service → set cookies → respond
// ---------------------------------------------------------------------------

// ── SME ──────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/auth/sme/register
 */
export const smeRegister = asyncHandler(async (req, res) => {
  const result = await registerSME(req.body, req.ip, req.headers['user-agent']);

  // Log registration audit log
  AuditLog.record({
    actor_id: result.user._id,
    actor_ref_model: 'SMEUser',
    actor_email: result.user.email,
    action: 'auth.register',
    method: 'POST',
    resource_path: req.originalUrl,
    resource_id: result.user._id,
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

/**
 * POST /api/v1/auth/sme/login
 */
export const smeLogin = asyncHandler(async (req, res) => {
  try {
    const result = await loginSME(req.body);
    return ApiResponse.ok(
      { mfaRequired: result.mfaRequired, tempToken: result.tempToken },
      'Credentials verified. Please enter the OTP code sent to your email.'
    ).send(res);
  } catch (error) {
    if (error.statusCode === 401) {
      await recordLoginFailure(req.ip);
      if (req.body?.email) {
        await recordLoginFailure(req.body.email);
      }
      
      AuditLog.record({
        action: 'auth.login_failed',
        method: 'POST',
        resource_path: req.originalUrl,
        status: 'failed',
        status_code: 401,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        metadata: { email: req.body?.email, reason: 'Invalid credentials' },
      }).catch(() => {});
    }
    throw error;
  }
});

// ── Bank Admin ────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/auth/bank/register
 */
export const bankAdminRegister = asyncHandler(async (req, res) => {
  const result = await registerBankAdmin(req.body);

  AuditLog.record({
    actor_id: result.user._id,
    actor_ref_model: 'BankAdminUser',
    actor_email: result.user.email,
    action: 'auth.register',
    method: 'POST',
    resource_path: req.originalUrl,
    resource_id: result.user._id,
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

/**
 * POST /api/v1/auth/bank/login
 */
export const bankAdminLogin = asyncHandler(async (req, res) => {
  try {
    const result = await loginBankAdmin(req.body);
    return ApiResponse.ok(
      { mfaRequired: result.mfaRequired, tempToken: result.tempToken },
      'Credentials verified. Please enter the OTP code sent to your email.'
    ).send(res);
  } catch (error) {
    if (error.statusCode === 401) {
      await recordLoginFailure(req.ip);
      if (req.body?.email) {
        await recordLoginFailure(req.body.email);
      }
      
      AuditLog.record({
        action: 'auth.login_failed',
        method: 'POST',
        resource_path: req.originalUrl,
        status: 'failed',
        status_code: 401,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        metadata: { email: req.body?.email, reason: 'Invalid credentials' },
      }).catch(() => {});
    }
    throw error;
  }
});

// ── MFA Verification ─────────────────────────────────────────────────────────

/**
 * POST /api/v1/auth/mfa/verify
 */
export const verifyMfa = asyncHandler(async (req, res) => {
  const { tempToken, code } = req.body;

  const result = await verifyMfaOTP(tempToken, code, req.ip, req.headers['user-agent']);

  // Rotate and set the long-lived refresh token in HTTP-Only cookie
  setRefreshTokenCookie(res, result.refreshToken);

  // Generate and set the CSRF protection cookie
  const csrfToken = generateCsrfToken();
  res.cookie('csrfToken', csrfToken, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    path: '/',
  });

  // Clear brute force counters on successful MFA login
  await clearLoginFailures(req.ip);
  await clearLoginFailures(result.user.email);

  AuditLog.record({
    actor_id: result.user._id,
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
    { user: result.user, accessToken: result.accessToken, csrfToken },
    'Login successful and session established'
  ).send(res);
});

// ── Shared ────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/auth/refresh
 */
export const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken || req.body?.refreshToken;

  const result = await refreshAccessToken(token, req.ip, req.headers['user-agent']);

  // Rotate refresh token
  setRefreshTokenCookie(res, result.refreshToken);

  return ApiResponse.ok(
    { accessToken: result.accessToken },
    'Token refreshed'
  ).send(res);
});

/**
 * POST /api/v1/auth/logout
 */
export const logout = asyncHandler(async (req, res) => {
  await authServiceLogout(req.user);

  clearRefreshTokenCookie(res);
  res.clearCookie('csrfToken');

  if (req.user) {
    AuditLog.record({
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

/**
 * GET /api/v1/auth/me
 */
export const getMe = asyncHandler(async (req, res) => {
  return ApiResponse.ok(req.user, 'Current user').send(res);
});
