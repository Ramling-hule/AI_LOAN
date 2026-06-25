import 'dotenv/config';

import { createApp } from './src/app.js';
import { initCloudinary } from './src/config/cloudinary.js';
import env from './src/config/env.js';
import logger from './src/utils/logger.js';

// ---------------------------------------------------------------------------
// Bootstrap the server
// ---------------------------------------------------------------------------

const start = async () => {
  try {
    // 1. Supabase Client is initialized automatically on import
    logger.info('✅  Supabase Client Initialized');

    // 2. Initialize external services
    initCloudinary();

    // 3. Create and start Express app
    const app = createApp();

    const server = app.listen(env.PORT, () => {
      logger.info(`🚀  Backend running on port ${env.PORT} [${env.NODE_ENV}]`);
      logger.info(`📡  API base: http://localhost:${env.PORT}/api`);
    });

    // Set server socket timeout to 10 minutes to support long-running AI operations on CPU
    server.timeout = 600000;

    // ── Graceful Shutdown ─────────────────────────────────────────────────
    const shutdown = (signal) => {
      logger.info(`${signal} received — shutting down gracefully...`);
      server.close(() => {
        logger.info('✅  HTTP server closed');
        process.exit(0);
      });

      // Force close after 10s
      setTimeout(() => {
        logger.error('⚠️  Could not close connections in time — forcefully shutting down');
        process.exit(1);
      }, 10_000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // ── Unhandled Rejections ──────────────────────────────────────────────
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    process.on('uncaughtException', (err) => {
      logger.error('Uncaught Exception:', err);
      process.exit(1);
    });
  } catch (err) {
    logger.error('❌  Failed to start server:', err);
    process.exit(1);
  }
};

start();
