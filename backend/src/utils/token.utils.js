import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

import env from '../config/env.js';

// ---------------------------------------------------------------------------
// Token Utilities
//
// Access token  — short-lived (env.JWT_EXPIRES_IN), sent in Authorization header
// Refresh token — long-lived (env.JWT_REFRESH_EXPIRES_IN), stored in httpOnly cookie
// ---------------------------------------------------------------------------

/**
 * Generate an access token for the given payload.
 * @param {{ id: string, email: string, role: string, type: 'sme'|'bank_admin'|'super_admin' }} payload
 * @returns {string} Signed JWT
 */
export const generateAccessToken = (payload) => {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
    jwtid: uuidv4(), // unique token ID for revocation tracking
  });
};

/**
 * Generate a refresh token.
 * @param {{ id: string }} payload
 * @returns {string} Signed JWT
 */
export const generateRefreshToken = (payload) => {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
    jwtid: uuidv4(),
  });
};

/**
 * Verify an access token.
 * @param {string} token
 * @returns {object} Decoded payload
 * @throws {JsonWebTokenError|TokenExpiredError}
 */
export const verifyAccessToken = (token) => {
  return jwt.verify(token, env.JWT_SECRET);
};

/**
 * Verify a refresh token.
 * @param {string} token
 * @returns {object} Decoded payload
 * @throws {JsonWebTokenError|TokenExpiredError}
 */
export const verifyRefreshToken = (token) => {
  return jwt.verify(token, env.JWT_REFRESH_SECRET);
};

/**
 * Set the refresh token as an httpOnly cookie.
 * @param {import('express').Response} res
 * @param {string} token
 */
export const setRefreshTokenCookie = (res, token) => {
  res.cookie('refreshToken', token, {
    httpOnly: true,                           // not accessible by JS
    secure: env.NODE_ENV === 'production',    // HTTPS only in prod
    sameSite: env.NODE_ENV === 'production' ? 'strict' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,        // 30 days in ms
    path: '/api/v1/auth',                     // only sent to auth routes
  });
};

/**
 * Clear the refresh token cookie.
 * @param {import('express').Response} res
 */
export const clearRefreshTokenCookie = (res) => {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'strict' : 'lax',
    path: '/api/v1/auth',
  });
};

/**
 * Build the safe user payload to embed in the JWT and return to the client.
 * Strips sensitive fields.
 * @param {object} user   - Mongoose document
 * @param {'sme'|'bank_admin'|'super_admin'} type
 * @returns {object}
 */
export const buildTokenPayload = (user, type) => ({
  id: user._id,
  email: user.email,
  role: type,
  role_id: user.role_id,
});

/**
 * Build the safe public user object returned to the client (no hashes).
 * @param {object} user  - Mongoose document (plain object or doc)
 * @param {'sme'|'bank_admin'|'super_admin'} type
 * @returns {object}
 */
export const sanitizeUser = (user, type) => {
  const obj = user.toObject ? user.toObject() : { ...user };
  delete obj.password_hash;
  obj.type = type;
  obj.role = type;
  return obj;
};
