'use strict';

require('dotenv').config();

const createApp = require('./src/app');
const env = require('./src/config/env');
const logger = require('./src/utils/logger');
const { ping: pingOllama } = require('./src/services/llm/ollamaService');
const { ping: pingChroma } = require('./src/services/vectorDb/chromaService');

const start = async () => {
  // Probe external AI services at startup (non-fatal)
  try {
    await pingOllama();
  } catch (err) {
    logger.warn(`⚠️  Ollama not reachable: ${err.message}`);
  }

  try {
    await pingChroma();
  } catch (err) {
    logger.warn(`⚠️  ChromaDB not reachable: ${err.message}`);
  }

  const app = createApp();

  const server = app.listen(env.AI_SERVICE_PORT, () => {
    logger.info(`🤖  AI Services running on port ${env.AI_SERVICE_PORT} [${env.NODE_ENV}]`);
    logger.info(`📡  API base: http://localhost:${env.AI_SERVICE_PORT}/api`);
  });

  const shutdown = (signal) => {
    logger.info(`${signal} received — shutting down AI services...`);
    server.close(() => {
      logger.info('✅  AI service HTTP server closed');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Rejection:', reason);
  });

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err);
    process.exit(1);
  });
};

start();
