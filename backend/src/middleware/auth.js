import { verifyAccessToken } from '../utils/token.utils.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { getSession, setSession } from '../config/redis.js';
import { getRolePermissions } from '../db/queries/users.queries.js';

// ---------------------------------------------------------------------------
// Role constants — single source of truth for all role strings
// ---------------------------------------------------------------------------

export const ROLES = Object.freeze({
  SME: 'sme',
  BANK_ADMIN: 'bank_admin',
  SUPER_ADMIN: 'super_admin',
});

// ---------------------------------------------------------------------------
// protect — JWT & Redis session authentication middleware
// ---------------------------------------------------------------------------

export const protect = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Access token is required');
  }

  const token = authHeader.split(' ')[1];

  const decoded = verifyAccessToken(token);

  // Validate active Redis session for revocation tracking
  const session = await getSession(decoded.sessionId);
  if (!session) {
    throw ApiError.unauthorized('Session has expired or was revoked');
  }

  req.user = decoded;  // { id, email, role, role_id, sessionId, iat, exp, jti }

  next();
});

// ---------------------------------------------------------------------------
// authorizeRoles — RBAC middleware factory (roles-based)
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
// authorizePermissions — RBAC middleware factory (fine-grained permissions)
// Checks if the user's role has the required permissions (with Redis cache)
// ---------------------------------------------------------------------------

export const authorizePermissions = (...requiredPermissions) =>
  asyncHandler(async (req, _res, next) => {
    if (!req.user) {
      throw ApiError.unauthorized('Not authenticated');
    }

    const session = await getSession(req.user.sessionId);
    if (!session) {
      throw ApiError.unauthorized('Session has expired');
    }

    let permissions = session.permissions;

    // Cache miss: retrieve permissions from PostgreSQL and cache in Redis session
    if (!permissions) {
      permissions = await getRolePermissions(req.user.role_id);
      
      // Update Redis session cache
      session.permissions = permissions;
      await setSession(req.user.sessionId, session);
    }

    const hasPermission = requiredPermissions.every(p => permissions.includes(p));
    if (!hasPermission) {
      throw ApiError.forbidden('You do not have the required permissions to access this resource');
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
