import Redis from 'ioredis';
import env from './env.js';
import logger from '../utils/logger.js';

let redisClient = null;

try {
  redisClient = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    reconnectOnError: (err) => {
      const targetError = 'READONLY';
      if (err.message.slice(0, targetError.length) === targetError) {
        return true;
      }
      return false;
    },
  });

  redisClient.on('connect', () => {
    logger.info('✅ Connected to Redis successfully');
  });

  redisClient.on('error', (err) => {
    logger.error('❌ Redis Connection Error:', err);
  });
} catch (error) {
  logger.error('❌ Redis Initialization Failed:', error);
}

/**
 * Store user session details in Redis
 */
export const setSession = async (sessionId, sessionData, ttlSeconds = 30 * 24 * 60 * 60) => {
  if (!redisClient) return;
  await redisClient.set(`session:${sessionId}`, JSON.stringify(sessionData), 'EX', ttlSeconds);
};

/**
 * Retrieve user session details from Redis
 */
export const getSession = async (sessionId) => {
  if (!redisClient) return null;
  const data = await redisClient.get(`session:${sessionId}`);
  return data ? JSON.parse(data) : null;
};

/**
 * Delete a user session from Redis
 */
export const deleteSession = async (sessionId) => {
  if (!redisClient) return;
  await redisClient.del(`session:${sessionId}`);
};

/**
 * Blacklist/mark a refresh token JTI as used/revoked
 */
export const blacklistToken = async (jti, ttlSeconds = 30 * 24 * 60 * 60) => {
  if (!redisClient) return;
  await redisClient.set(`blacklist:token:${jti}`, 'revoked', 'EX', ttlSeconds);
};

/**
 * Check if a refresh token JTI is blacklisted/revoked
 */
export const isTokenBlacklisted = async (jti) => {
  if (!redisClient) return false;
  const res = await redisClient.get(`blacklist:token:${jti}`);
  return !!res;
};

export { redisClient };
export default redisClient;
