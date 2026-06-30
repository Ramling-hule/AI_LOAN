import argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';

import {
  findSMEByEmail, findSMEById, createSMEUser, updateSMELastLogin,
  findBankAdminByEmail, findBankAdminById, createBankAdminUser, updateBankAdminLastLogin,
  findRoleByName, getRolePermissions,
} from '../db/queries/users.queries.js';
import { createOtp, deleteOtpsByUserContact, findOtp, incrementOtpAttempts, deleteOtp } from '../db/queries/otps.queries.js';
import { recordAuditLog } from '../db/queries/auditLogs.queries.js';
import {
  generateAccessToken, generateRefreshToken, verifyRefreshToken,
  buildTokenPayload, sanitizeUser, generateMfaToken, verifyMfaToken,
} from '../utils/token.utils.js';
import ApiError from '../utils/ApiError.js';
import logger from '../utils/logger.js';
import { setSession, getSession, deleteSession, blacklistToken, isTokenBlacklisted } from '../config/redis.js';






const sendMfaOtp = async (userId, email) => {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  await deleteOtpsByUserContact(userId, email);
  await createOtp({ user_id: userId, contact: email, code, expiresInMs: 5 * 60 * 1000 });
  logger.info(`[MFA OTP LOG] Generated OTP for ${email}: ${code}`);
  return code;
};



export const registerSME = async (data, _ipAddress, _userAgent) => {
  const { full_name, business_name, phone, email, password, address } = data;

  const existing = await findSMEByEmail(email);
  if (existing) throw ApiError.conflict('An account with this email already exists');

  const role = await findRoleByName('sme_applicant');
  if (!role) throw ApiError.internal('Default role not found. Please run database migration.');

  const password_hash = await argon2.hash(password);

  const user = await createSMEUser({ full_name, business_name, phone, email, password_hash, role_id: role.id, address });

  logger.info(`SME registered: ${email}`);

  await sendMfaOtp(user.id, email);
  const tempToken = generateMfaToken({ id: user.id, email, role: 'sme' });

  return { mfaRequired: true, tempToken, user: sanitizeUser(user, 'sme') };
};

export const loginSME = async ({ email, password }) => {
  const user = await findSMEByEmail(email, true); 
  if (!user) throw ApiError.unauthorized('Invalid email or password');
  if (!user.is_active) throw ApiError.forbidden('Your account has been deactivated. Contact support.');

  const isMatch = await argon2.verify(user.password_hash, password);
  if (!isMatch) throw ApiError.unauthorized('Invalid email or password');

  await sendMfaOtp(user.id, email);
  const tempToken = generateMfaToken({ id: user.id, email, role: 'sme' });

  logger.info(`SME login phase 1 passed: ${email}, MFA pending`);
  return { mfaRequired: true, tempToken };
};



export const registerBankAdmin = async (data) => {
  const { bank_name, branch_name, branch_address, ifsc_code, admin_name, email, phone, password } = data;

  const existing = await findBankAdminByEmail(email);
  if (existing) throw ApiError.conflict('An account with this email already exists');

  const role = await findRoleByName('bank_underwriter');
  if (!role) throw ApiError.internal('Default role not found. Please run database migration.');

  const password_hash = await argon2.hash(password);

  const user = await createBankAdminUser({ bank_name, branch_name, branch_address, ifsc_code, admin_name, email, phone, password_hash, role_id: role.id });

  logger.info(`Bank admin registered: ${email}`);

  await sendMfaOtp(user.id, email);
  const tempToken = generateMfaToken({ id: user.id, email, role: 'bank_admin' });

  return { mfaRequired: true, tempToken, user: sanitizeUser(user, 'bank_admin') };
};

export const loginBankAdmin = async ({ email, password }) => {
  const user = await findBankAdminByEmail(email, true);
  if (!user) throw ApiError.unauthorized('Invalid email or password');
  if (!user.is_active) throw ApiError.forbidden('Your account has been deactivated. Contact support.');

  const isMatch = await argon2.verify(user.password_hash, password);
  if (!isMatch) throw ApiError.unauthorized('Invalid email or password');

  await sendMfaOtp(user.id, email);
  const tempToken = generateMfaToken({ id: user.id, email, role: 'bank_admin' });

  logger.info(`Bank admin login phase 1 passed: ${email}, MFA pending`);
  return { mfaRequired: true, tempToken };
};



export const verifyMfaOTP = async (tempToken, code, ipAddress, userAgent) => {
  if (!tempToken || !code) throw ApiError.badRequest('MFA token and verification code are required');

  let decoded;
  try { decoded = verifyMfaToken(tempToken); }
  catch { throw ApiError.unauthorized('Invalid or expired MFA session'); }

  const { id, email, role } = decoded;

  const otp = await findOtp({ user_id: id, contact: email });
  if (!otp) throw ApiError.notFound('No verification request found. Please login again.');
  if (otp.expires_at < new Date()) {
    await deleteOtp(otp.id);
    throw ApiError.badRequest('Verification code has expired. Please login again.');
  }
  if (otp.code !== code) {
    await incrementOtpAttempts(otp.id);
    if (otp.attempts + 1 >= 3) {
      await deleteOtp(otp.id);
      throw ApiError.badRequest('Too many failed attempts. Please login again.');
    }
    throw ApiError.badRequest('Invalid verification code');
  }

  await deleteOtp(otp.id);

  let user;
  if (role === 'sme') {
    user = await findSMEById(id);
  } else {
    user = await findBankAdminById(id);
  }

  if (!user || !user.is_active) throw ApiError.unauthorized('User not found or account is inactive');

  
  if (role === 'sme') await updateSMELastLogin(id);
  else await updateBankAdminLastLogin(id);

  const payload = buildTokenPayload(user, role);
  const jti = uuidv4();
  const refreshToken = generateRefreshToken({ id: user.id }, jti);
  const accessToken = generateAccessToken(payload, jti);

  await setSession(jti, { userId: user.id, email: user.email, role, ipAddress, userAgent, createdAt: new Date() });

  logger.info(`MFA verified. User logged in: ${email}`);
  return { user: sanitizeUser(user, role), accessToken, refreshToken };
};



export const refreshAccessToken = async (refreshToken, ipAddress, userAgent) => {
  if (!refreshToken) throw ApiError.unauthorized('Refresh token is required');

  let decoded;
  try { decoded = verifyRefreshToken(refreshToken); }
  catch { throw ApiError.unauthorized('Invalid or expired refresh token'); }

  const { id, jti } = decoded;

  const isBlacklisted = await isTokenBlacklisted(jti);
  if (isBlacklisted) {
    recordAuditLog({ actor_id: id, action: 'security.token_reuse_fraud', status: 'failure', ip_address: ipAddress, metadata: { reason: 'Refresh token reuse' } });
    throw ApiError.unauthorized('Security alert: Token reuse detected. Please log in again.');
  }

  const session = await getSession(jti);
  if (!session) throw ApiError.unauthorized('Session has expired. Please log in again.');

  await blacklistToken(jti);
  await deleteSession(jti);

  let user = await findSMEById(id);
  let type = 'sme';
  if (!user) { user = await findBankAdminById(id); type = 'bank_admin'; }
  if (!user || !user.is_active) throw ApiError.unauthorized('User not found or account is inactive');

  const newJti = uuidv4();
  const newRefreshToken = generateRefreshToken({ id: user.id }, newJti);
  const newAccessToken = generateAccessToken(buildTokenPayload(user, type), newJti);
  await setSession(newJti, { userId: user.id, email: user.email, role: type, ipAddress, userAgent, createdAt: new Date() });

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
};



export const logout = async (accessTokenPayload) => {
  if (accessTokenPayload?.sessionId) {
    await deleteSession(accessTokenPayload.sessionId);
    await blacklistToken(accessTokenPayload.sessionId);
  }
  return true;
};
