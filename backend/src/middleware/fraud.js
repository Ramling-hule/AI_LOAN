import redisClient from '../config/redis.js';
import AuditLog from '../models/auditLog.model.js';
import logger from '../utils/logger.js';

/**
 * Record a login failure count in Redis
 */
export const recordLoginFailure = async (key) => {
  if (!redisClient) return 0;
  const redisKey = `login_fail:${key}`;
  const count = await redisClient.incr(redisKey);
  if (count === 1) {
    await redisClient.expire(redisKey, 600); // 10 minutes window
  }
  return count;
};

/**
 * Get login failure count
 */
export const getLoginFailures = async (key) => {
  if (!redisClient) return 0;
  const count = await redisClient.get(`login_fail:${key}`);
  return count ? parseInt(count, 10) : 0;
};

/**
 * Clear login failure count
 */
export const clearLoginFailures = async (key) => {
  if (!redisClient) return;
  await redisClient.del(`login_fail:${key}`);
};

/**
 * Middleware to check if an IP or Email is temporarily locked out due to brute force
 */
export const checkBruteForce = async (req, res, next) => {
  const ip = req.ip;
  const email = req.body?.email;

  const ipFailures = await getLoginFailures(ip);
  if (ipFailures >= 5) {
    logger.warn(`Brute force attempt detected from IP: ${ip}`);
    
    // Log a fraud audit log
    AuditLog.record({
      action: 'security.brute_force_block',
      method: req.method,
      resource_path: req.originalUrl,
      status: 'failed',
      status_code: 429,
      ip_address: ip,
      user_agent: req.headers['user-agent'],
      metadata: { ip, email, reason: 'Too many failed login attempts' }
    }).catch(() => {});

    return res.status(429).json({
      success: false,
      message: 'Too many failed attempts from this IP. Please try again after 10 minutes.',
    });
  }

  if (email) {
    const emailFailures = await getLoginFailures(email);
    if (emailFailures >= 5) {
      logger.warn(`Brute force attempt detected for Email: ${email}`);
      return res.status(429).json({
        success: false,
        message: 'This account is temporarily locked due to multiple failed login attempts. Please try again after 10 minutes.',
      });
    }
  }

  next();
};

/**
 * Session Hijacking & IP Anomaly Detector Middleware
 * Validates that the current request's IP and User Agent match the active session.
 */
export const detectSessionAnomaly = async (req, res, next) => {
  // Only applies if the user is authenticated and sessionId exists
  if (!req.user || !req.user.sessionId) {
    return next();
  }

  const sessionKey = `session:${req.user.sessionId}`;
  if (!redisClient) return next();

  const session = await redisClient.get(sessionKey);
  if (!session) {
    return next();
  }

  const sessionData = JSON.parse(session);

  const currentIp = req.ip;
  const currentUserAgent = req.headers['user-agent'];

  // Helper to parse subnet segment (first 2 segments of IPv4)
  const getSubnet = (ip) => {
    if (!ip) return '';
    const parts = ip.split('.');
    if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
    return ip;
  };

  const originalSubnet = getSubnet(sessionData.ipAddress);
  const currentSubnet = getSubnet(currentIp);

  const userAgentMatches = currentUserAgent === sessionData.userAgent;
  const subnetMatches = originalSubnet === currentSubnet;

  if (!subnetMatches || !userAgentMatches) {
    logger.error(`🚨 FRAUD ANOMALY DETECTED: Hijacking attempt for user ${req.user.id}!`);
    logger.error(`Original IP: ${sessionData.ipAddress}, Current IP: ${currentIp}`);
    logger.error(`Original UA: ${sessionData.userAgent}, Current UA: ${currentUserAgent}`);

    // Revoke the session immediately in Redis
    await redisClient.del(sessionKey);

    // Record Critical Audit Log
    AuditLog.record({
      actor_id: req.user.id,
      actor_ref_model: req.user.role === 'sme' ? 'SMEUser' : 'BankAdminUser',
      actor_email: req.user.email,
      action: 'security.session_anomaly_revoke',
      method: req.method,
      resource_path: req.originalUrl,
      status: 'failed',
      status_code: 403,
      ip_address: currentIp,
      user_agent: currentUserAgent,
      metadata: {
        reason: 'IP or User-Agent changed during active session (potential session hijacking)',
        originalIp: sessionData.ipAddress,
        originalUserAgent: sessionData.userAgent,
      }
    }).catch(() => {});

    // Clear client cookies
    res.clearCookie('refreshToken');
    res.clearCookie('csrfToken');

    return res.status(403).json({
      success: false,
      message: 'Access denied. Security anomaly detected, session terminated.',
    });
  }

  next();
};
