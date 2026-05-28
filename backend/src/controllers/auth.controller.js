import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';
import {
  registerSME,
  loginSME,
  registerBankAdmin,
  loginBankAdmin,
  refreshAccessToken,
  logout as authServiceLogout,
} from '../services/auth.service.js';
import { setRefreshTokenCookie, clearRefreshTokenCookie } from '../utils/token.utils.js';
import AuditLog from '../models/auditLog.model.js';

// ---------------------------------------------------------------------------
// Auth Controller
// Thin layer: validate input → delegate to service → set cookies → respond
// ---------------------------------------------------------------------------

// ── SME ──────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/auth/sme/register
 */
export const smeRegister = asyncHandler(async (req, res) => {
  const result = await registerSME(req.body);

  setRefreshTokenCookie(res, result.refreshToken);

  // Fire-and-forget audit log
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
  }).catch(() => {}); // never block registration on audit failure

  return ApiResponse.created(
    { user: result.user, accessToken: result.accessToken },
    'SME account created successfully'
  ).send(res);
});

/**
 * POST /api/v1/auth/sme/login
 */
export const smeLogin = asyncHandler(async (req, res) => {
  const result = await loginSME(req.body);

  setRefreshTokenCookie(res, result.refreshToken);

  AuditLog.record({
    actor_id: result.user._id,
    actor_ref_model: 'SMEUser',
    actor_email: result.user.email,
    action: 'auth.login',
    method: 'POST',
    resource_path: req.originalUrl,
    status: 'success',
    status_code: 200,
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
  }).catch(() => {});

  return ApiResponse.ok(
    { user: result.user, accessToken: result.accessToken },
    'Login successful'
  ).send(res);
});

// ── Bank Admin ────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/auth/bank/register
 */
export const bankAdminRegister = asyncHandler(async (req, res) => {
  const result = await registerBankAdmin(req.body);

  setRefreshTokenCookie(res, result.refreshToken);

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
    { user: result.user, accessToken: result.accessToken },
    'Bank admin account created successfully'
  ).send(res);
});

/**
 * POST /api/v1/auth/bank/login
 */
export const bankAdminLogin = asyncHandler(async (req, res) => {
  const result = await loginBankAdmin(req.body);

  setRefreshTokenCookie(res, result.refreshToken);

  AuditLog.record({
    actor_id: result.user._id,
    actor_ref_model: 'BankAdminUser',
    actor_email: result.user.email,
    action: 'auth.login',
    method: 'POST',
    resource_path: req.originalUrl,
    status: 'success',
    status_code: 200,
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
  }).catch(() => {});

  return ApiResponse.ok(
    { user: result.user, accessToken: result.accessToken },
    'Login successful'
  ).send(res);
});

// ── Shared ────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/auth/refresh
 * Accepts refresh token from httpOnly cookie (preferred) or req.body.refreshToken
 */
export const refresh = asyncHandler(async (req, res) => {
  // Cookie takes priority; body is fallback for clients that can't use cookies
  const token = req.cookies?.refreshToken || req.body?.refreshToken;

  const result = await refreshAccessToken(token);

  // Rotate refresh token (reissue)
  setRefreshTokenCookie(res, result.refreshToken);

  return ApiResponse.ok(
    { accessToken: result.accessToken },
    'Token refreshed'
  ).send(res);
});

/**
 * POST /api/v1/auth/logout
 * Clears the refresh token cookie. Client must discard access token.
 */
export const logout = asyncHandler(async (req, res) => {
  await authServiceLogout();

  clearRefreshTokenCookie(res);

  // Audit logout if user is identified via req.user (from protect middleware)
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
 * Returns the currently authenticated user's data.
 */
export const getMe = asyncHandler(async (req, res) => {
  return ApiResponse.ok(req.user, 'Current user').send(res);
});
