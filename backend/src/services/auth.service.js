import bcrypt from 'bcryptjs';

import { SMEUser, BankAdminUser, Role } from '../models/index.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  buildTokenPayload,
  sanitizeUser,
} from '../utils/token.utils.js';
import ApiError from '../utils/ApiError.js';
import env from '../config/env.js';
import logger from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Auth Service
// Handles registration, login, token refresh, and logout for both
// SME users and Bank Admin users.
// ---------------------------------------------------------------------------

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Find or create the default role by name.
 * Falls back gracefully if the role doesn't exist yet.
 */
const getRoleByName = async (name) => {
  const role = await Role.findOne({ name, is_deleted: false });
  if (!role) {
    throw ApiError.internal(`Default role '${name}' not found. Please seed roles first.`);
  }
  return role;
};

// ── SME Auth ──────────────────────────────────────────────────────────────────

/**
 * Register a new SME user.
 * @param {object} data - Validated request body from smeRegisterSchema
 * @returns {{ user: object, accessToken: string, refreshToken: string }}
 */
export const registerSME = async (data) => {
  const { full_name, business_name, phone, email, password, address } = data;

  // 1. Check for duplicate email
  const existing = await SMEUser.findOne({ email, is_deleted: false });
  if (existing) {
    throw ApiError.conflict('An account with this email already exists');
  }

  // 2. Get default SME role
  const role = await getRoleByName('sme_applicant');

  // 3. Hash password
  const password_hash = await bcrypt.hash(password, env.BCRYPT_SALT_ROUNDS);

  // 4. Create user
  const user = await SMEUser.create({
    full_name,
    business_name,
    phone,
    email,
    address,
    password_hash,
    role_id: role._id,
  });

  // 5. Generate tokens
  const payload = buildTokenPayload(user, 'sme');
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken({ id: user._id });

  logger.info(`SME registered: ${email}`);

  return {
    user: sanitizeUser(user, 'sme'),
    accessToken,
    refreshToken,
  };
};

/**
 * Login an SME user.
 * @param {{ email: string, password: string }} credentials
 * @returns {{ user: object, accessToken: string, refreshToken: string }}
 */
export const loginSME = async ({ email, password }) => {
  // 1. Find user (include password_hash)
  const user = await SMEUser.findOne({ email, is_deleted: false }).select('+password_hash');
  if (!user) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  // 2. Check active status
  if (!user.is_active) {
    throw ApiError.forbidden('Your account has been deactivated. Contact support.');
  }

  // 3. Verify password
  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  // 4. Update last login
  user.last_login_at = new Date();
  await user.save();

  // 5. Generate tokens
  const payload = buildTokenPayload(user, 'sme');
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken({ id: user._id });

  logger.info(`SME login: ${email}`);

  return {
    user: sanitizeUser(user, 'sme'),
    accessToken,
    refreshToken,
  };
};

// ── Bank Admin Auth ───────────────────────────────────────────────────────────

/**
 * Register a new Bank Admin user.
 * @param {object} data - Validated request body from bankAdminRegisterSchema
 * @returns {{ user: object, accessToken: string, refreshToken: string }}
 */
export const registerBankAdmin = async (data) => {
  const { bank_name, branch_name, branch_address, ifsc_code, admin_name, email, phone, password } = data;

  // 1. Check for duplicate email
  const existing = await BankAdminUser.findOne({ email, is_deleted: false });
  if (existing) {
    throw ApiError.conflict('An account with this email already exists');
  }

  // 2. Get default Bank Admin role
  const role = await getRoleByName('bank_underwriter');

  // 3. Hash password
  const password_hash = await bcrypt.hash(password, env.BCRYPT_SALT_ROUNDS);

  // 4. Create user
  const user = await BankAdminUser.create({
    bank_name,
    branch_name,
    branch_address,
    ifsc_code,
    admin_name,
    email,
    phone,
    password_hash,
    role_id: role._id,
  });

  // 5. Generate tokens
  const payload = buildTokenPayload(user, 'bank_admin');
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken({ id: user._id });

  logger.info(`Bank admin registered: ${email}`);

  return {
    user: sanitizeUser(user, 'bank_admin'),
    accessToken,
    refreshToken,
  };
};

/**
 * Login a Bank Admin user.
 * @param {{ email: string, password: string }} credentials
 * @returns {{ user: object, accessToken: string, refreshToken: string }}
 */
export const loginBankAdmin = async ({ email, password }) => {
  const user = await BankAdminUser.findOne({ email, is_deleted: false }).select('+password_hash');
  if (!user) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  if (!user.is_active) {
    throw ApiError.forbidden('Your account has been deactivated. Contact support.');
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  user.last_login_at = new Date();
  await user.save();

  const payload = buildTokenPayload(user, 'bank_admin');
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken({ id: user._id });

  logger.info(`Bank admin login: ${email}`);

  return {
    user: sanitizeUser(user, 'bank_admin'),
    accessToken,
    refreshToken,
  };
};

// ── Refresh Token ─────────────────────────────────────────────────────────────

/**
 * Issue a new access token using a valid refresh token.
 * Accepts refresh token from httpOnly cookie (preferred) or request body.
 *
 * @param {string} refreshToken
 * @returns {{ accessToken: string, refreshToken: string }}
 */
export const refreshAccessToken = async (refreshToken) => {
  if (!refreshToken) {
    throw ApiError.unauthorized('Refresh token is required');
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  // Try SME first, then BankAdmin
  let user = await SMEUser.findOne({ _id: decoded.id, is_deleted: false });
  let type = 'sme';

  if (!user) {
    user = await BankAdminUser.findOne({ _id: decoded.id, is_deleted: false });
    type = 'bank_admin';
  }

  if (!user || !user.is_active) {
    throw ApiError.unauthorized('User not found or account is inactive');
  }

  const payload = buildTokenPayload(user, type);
  const newAccessToken = generateAccessToken(payload);
  const newRefreshToken = generateRefreshToken({ id: user._id });

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  };
};

// ── Logout ────────────────────────────────────────────────────────────────────

/**
 * Logout — currently stateless (clears cookie server-side).
 * For full token revocation, add a blocklist/Redis layer here.
 */
export const logout = async () => {
  // In a stateless JWT setup, logout is handled client-side.
  // Add Redis blacklist here when implementing token revocation.
  return true;
};
