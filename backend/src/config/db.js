import mongoose from 'mongoose';

import env from './env.js';
import logger from '../utils/logger.js';

// ---------------------------------------------------------------------------
// MongoDB connection with retry logic and graceful shutdown hooks.
// ---------------------------------------------------------------------------

const MONGOOSE_OPTIONS = {
  // Use the new URL parser and topology engine (defaults in Mongoose 7+)
  autoIndex: env.NODE_ENV !== 'production', // disable autoIndex in prod for perf
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 10000,
};

/**
 * Connect to MongoDB. Retries indefinitely in development,
 * exits process on failure in production.
 */
export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(env.MONGO_URI, MONGOOSE_OPTIONS);
    logger.info(`✅  MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    logger.error(`❌  MongoDB connection error: ${error.message}`);
    if (env.NODE_ENV === 'production') {
      process.exit(1);
    }
    // Retry after 5 seconds in development
    logger.info('🔄  Retrying MongoDB connection in 5s...');
    setTimeout(connectDB, 5000);
  }
};

// Mongoose connection event listeners
mongoose.connection.on('disconnected', () => {
  logger.warn('⚠️  MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  logger.info('🔄  MongoDB reconnected');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  logger.info('🛑  MongoDB connection closed (SIGINT)');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await mongoose.connection.close();
  logger.info('🛑  MongoDB connection closed (SIGTERM)');
  process.exit(0);
});

export { mongoose };
