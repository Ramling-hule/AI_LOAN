import { verifyAccessToken } from '../utils/token.utils.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

// ---------------------------------------------------------------------------
// Role constants — single source of truth for all role strings
// ---------------------------------------------------------------------------

export const ROLES = Object.freeze({
  SME: 'sme',
  BANK_ADMIN: 'bank_admin',
  SUPER_ADMIN: 'super_admin',
});

// ---------------------------------------------------------------------------
// protect — JWT authentication middleware
//
// Extracts the Bearer token from the Authorization header,
// verifies it, and attaches the decoded payload to req.user.
// ---------------------------------------------------------------------------

export const protect = asyncHandler(async (req, _res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Access token is required');
  }

  const token = authHeader.split(' ')[1];

  const decoded = verifyAccessToken(token);
  req.user = decoded;  // { id, email, role, role_id, iat, exp, jti }

  next();
});

// ---------------------------------------------------------------------------
// authorizeRoles — RBAC middleware factory
//
// Usage:
//   router.get('/admin', protect, authorizeRoles(ROLES.BANK_ADMIN, ROLES.SUPER_ADMIN))
// ---------------------------------------------------------------------------

export const authorizeRoles = (...allowedRoles) =>
  asyncHandler(async (req, _res, next) => {
    if (!req.user) {
      throw ApiError.unauthorized('Not authenticated');
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw ApiError.forbidden(
        `Role '${req.user.role}' is not authorized to access this resource`
      );
    }

    next();
  });

// ---------------------------------------------------------------------------
// Convenience role guards (pre-built middleware stacks)
// ---------------------------------------------------------------------------

/** Only SME applicants */
export const requireSME = [protect, authorizeRoles(ROLES.SME)];

/** Only bank admins */
export const requireBankAdmin = [protect, authorizeRoles(ROLES.BANK_ADMIN)];

/** Only super admins */
export const requireSuperAdmin = [protect, authorizeRoles(ROLES.SUPER_ADMIN)];

/** Bank admin or super admin */
export const requireBankOrSuper = [protect, authorizeRoles(ROLES.BANK_ADMIN, ROLES.SUPER_ADMIN)];

/** Any authenticated user */
export const requireAuth = [protect];
