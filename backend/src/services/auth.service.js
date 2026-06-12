import argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';

import { SMEUser, BankAdminUser, Role, OTP } from '../models/index.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  buildTokenPayload,
  sanitizeUser,
  generateMfaToken,
  verifyMfaToken,
} from '../utils/token.utils.js';
import ApiError from '../utils/ApiError.js';
import logger from '../utils/logger.js';
import { setSession, getSession, deleteSession, blacklistToken, isTokenBlacklisted } from '../config/redis.js';
import AuditLog from '../models/auditLog.model.js';

// ---------------------------------------------------------------------------
// Auth Service
// Handles registration, login, token refresh, and logout for both
// SME users and Bank Admin users.
// ---------------------------------------------------------------------------

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Find or create the default role by name.
 */
const getRoleByName = async (name) => {
  const role = await Role.findOne({ name, is_deleted: false });
  if (!role) {
    throw ApiError.internal(`Default role '${name}' not found. Please seed roles first.`);
  }
  return role;
};

/**
 * Helper to generate and store OTP code for user login MFA.
 */
const sendMfaOtp = async (userId, email) => {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  await OTP.deleteMany({ sme_id: userId, contact: email });
  await OTP.create({
    sme_id: userId,
    contact: email,
    code,
    expires_at: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
  });
  logger.info(`[MFA OTP LOG] Generated login MFA code for user ${email}: ${code}`);
  return code;
};

// ── SME Auth ──────────────────────────────────────────────────────────────────

/**
 * Register a new SME user.
 * @param {object} data - Validated request body from smeRegisterSchema
 */
export const registerSME = async (data, _ipAddress, _userAgent) => {
  const { full_name, business_name, phone, email, password, address } = data;

  // 1. Check for duplicate email
  const existing = await SMEUser.findOne({ email, is_deleted: false });
  if (existing) {
    throw ApiError.conflict('An account with this email already exists');
  }

  // 2. Get default SME role
  const role = await getRoleByName('sme_applicant');

  // 3. Hash password using Argon2
  const password_hash = await argon2.hash(password);

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

  logger.info(`SME registered: ${email}`);

  // Trigger MFA immediately after registration for first login/activation
  await sendMfaOtp(user._id, email);
  const tempToken = generateMfaToken({ id: user._id, email, role: 'sme' });

  return {
    mfaRequired: true,
    tempToken,
    user: sanitizeUser(user, 'sme'),
  };
};

/**
 * Login an SME user.
 * @param {{ email: string, password: string }} credentials
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

  // 3. Verify password using Argon2
  const isMatch = await argon2.verify(user.password_hash, password);
  if (!isMatch) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  // 4. Trigger MFA OTP
  await sendMfaOtp(user._id, email);
  const tempToken = generateMfaToken({ id: user._id, email, role: 'sme' });

  logger.info(`SME login phase 1 passed: ${email}, MFA pending`);

  return {
    mfaRequired: true,
    tempToken,
  };
};

// ── Bank Admin Auth ───────────────────────────────────────────────────────────

/**
 * Register a new Bank Admin user.
 * @param {object} data - Validated request body from bankAdminRegisterSchema
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

  // 3. Hash password using Argon2
  const password_hash = await argon2.hash(password);

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

  logger.info(`Bank admin registered: ${email}`);

  // Trigger MFA immediately
  await sendMfaOtp(user._id, email);
  const tempToken = generateMfaToken({ id: user._id, email, role: 'bank_admin' });

  return {
    mfaRequired: true,
    tempToken,
    user: sanitizeUser(user, 'bank_admin'),
  };
};

/**
 * Login a Bank Admin user.
 * @param {{ email: string, password: string }} credentials
 */
export const loginBankAdmin = async ({ email, password }) => {
  const user = await BankAdminUser.findOne({ email, is_deleted: false }).select('+password_hash');
  if (!user) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  if (!user.is_active) {
    throw ApiError.forbidden('Your account has been deactivated. Contact support.');
  }

  const isMatch = await argon2.verify(user.password_hash, password);
  if (!isMatch) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  // Trigger MFA OTP
  await sendMfaOtp(user._id, email);
  const tempToken = generateMfaToken({ id: user._id, email, role: 'bank_admin' });

  logger.info(`Bank admin login phase 1 passed: ${email}, MFA pending`);

  return {
    mfaRequired: true,
    tempToken,
  };
};

// ── MFA Verification ─────────────────────────────────────────────────────────

/**
 * Verify MFA OTP and issue session tokens.
 */
export const verifyMfaOTP = async (tempToken, code, ipAddress, userAgent) => {
  if (!tempToken || !code) {
    throw ApiError.badRequest('MFA token and verification code are required');
  }

  let decoded;
  try {
    decoded = verifyMfaToken(tempToken);
  } catch {
    throw ApiError.unauthorized('Invalid or expired MFA session');
  }

  const { id, email, role } = decoded;

  // Find the OTP document
  const otp = await OTP.findOne({ sme_id: id, contact: email });
  if (!otp) {
    throw ApiError.notFound('No verification request found. Please login again.');
  }

  // Check expiry
  if (otp.expires_at < new Date()) {
    await otp.deleteOne();
    throw ApiError.badRequest('Verification code has expired. Please login again.');
  }

  // Check code match
  if (otp.code !== code) {
    otp.attempts += 1;
    await otp.save();
    if (otp.attempts >= 3) {
      await otp.deleteOne();
      throw ApiError.badRequest('Too many failed attempts. Please login again.');
    }
    throw ApiError.badRequest('Invalid verification code');
  }

  // Successfully verified! Delete OTP
  await otp.deleteOne();

  // Retrieve full user record
  let user;
  if (role === 'sme') {
    user = await SMEUser.findOne({ _id: id, is_deleted: false });
  } else {
    user = await BankAdminUser.findOne({ _id: id, is_deleted: false });
  }

  if (!user || !user.is_active) {
    throw ApiError.unauthorized('User not found or account is inactive');
  }

  user.last_login_at = new Date();
  await user.save();

  // Create rotating session tokens
  const payload = buildTokenPayload(user, role);
  const jti = uuidv4();
  const refreshToken = generateRefreshToken({ id: user._id }, jti);
  const accessToken = generateAccessToken(payload, jti);

  // Store user session in Redis
  const sessionData = {
    userId: user._id,
    email: user.email,
    role,
    ipAddress,
    userAgent,
    createdAt: new Date(),
  };
  await setSession(jti, sessionData);

  logger.info(`MFA verified successfully. User logged in: ${email}`);

  return {
    user: sanitizeUser(user, role),
    accessToken,
    refreshToken,
  };
};

// ── Refresh Token ─────────────────────────────────────────────────────────────

/**
 * Issue a new access token using a valid refresh token with rotation.
 */
export const refreshAccessToken = async (refreshToken, ipAddress, userAgent) => {
  if (!refreshToken) {
    throw ApiError.unauthorized('Refresh token is required');
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  const { id, jti } = decoded;

  // 1. Detect Refresh Token Reuse (Potential Theft / Hijacking)
  const isBlacklisted = await isTokenBlacklisted(jti);
  if (isBlacklisted) {
    // Revoke all sessions for this user ID to prevent fraud
    logger.error(`🚨 FRAUD DETECTED: Refresh token reuse for user ${id}! Blacklisting all user sessions.`);
    
    AuditLog.record({
      actor_id: id,
      action: 'security.token_reuse_fraud',
      status: 'failed',
      status_code: 401,
      ip_address: ipAddress,
      user_agent: userAgent,
      metadata: { reason: 'Refresh token reuse detected', tokenJti: jti }
    }).catch(() => {});

    throw ApiError.unauthorized('Security alert: Token reuse detected. Please log in again.');
  }

  // 2. Fetch active session from Redis
  const session = await getSession(jti);
  if (!session) {
    throw ApiError.unauthorized('Session has expired. Please log in again.');
  }

  // 3. Mark old refresh token as used (blacklist it)
  await blacklistToken(jti);
  await deleteSession(jti);

  // Try SME first, then BankAdmin
  let user = await SMEUser.findOne({ _id: id, is_deleted: false });
  let type = 'sme';

  if (!user) {
    user = await BankAdminUser.findOne({ _id: id, is_deleted: false });
    type = 'bank_admin';
  }

  if (!user || !user.is_active) {
    throw ApiError.unauthorized('User not found or account is inactive');
  }

  // 4. Generate new rotating tokens
  const newJti = uuidv4();
  const newRefreshToken = generateRefreshToken({ id: user._id }, newJti);
  const payload = buildTokenPayload(user, type);
  const newAccessToken = generateAccessToken(payload, newJti);

  // 5. Store new session in Redis
  const sessionData = {
    userId: user._id,
    email: user.email,
    role: type,
    ipAddress,
    userAgent,
    createdAt: new Date(),
  };
  await setSession(newJti, sessionData);

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  };
};

// ── Logout ────────────────────────────────────────────────────────────────────

/**
 * Logout — deletes the session from Redis and blacklists the token JTI.
 */
export const logout = async (accessTokenPayload) => {
  if (accessTokenPayload && accessTokenPayload.sessionId) {
    await deleteSession(accessTokenPayload.sessionId);
    await blacklistToken(accessTokenPayload.sessionId);
  }
  return true;
};
