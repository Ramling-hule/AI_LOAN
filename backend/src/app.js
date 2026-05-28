import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

import env from './config/env.js';
import logger from './utils/logger.js';
import requestLogger from './middleware/requestLogger.js';
import errorHandler from './middleware/errorHandler.js';
import { rateLimiter } from './middleware/rateLimiter.js';
import router from './routes/index.js';

// ---------------------------------------------------------------------------
// Express Application Factory
// ---------------------------------------------------------------------------

export const createApp = () => {
  const app = express();

  // ── Security Headers ──────────────────────────────────────────────────────
  app.use(helmet());

  // ── CORS ──────────────────────────────────────────────────────────────────
  app.use(
    cors({
      origin: env.NODE_ENV === 'production' 
        ? process.env.ALLOWED_ORIGINS?.split(',') 
        : ['http://localhost:3000', 'http://localhost:5173'],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,   // required for httpOnly cookies
    })
  );

  // ── Body Parsers ──────────────────────────────────────────────────────────
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // ── Cookie Parser (for httpOnly refresh token) ────────────────────────────
  app.use(cookieParser());

  // ── HTTP Request Logging ──────────────────────────────────────────────────
  app.use(requestLogger);

  // ── Rate Limiting ─────────────────────────────────────────────────────────
  app.use('/api', rateLimiter);

  // ── API Routes ────────────────────────────────────────────────────────────
  app.use('/api', router);

  // ── Root health check ─────────────────────────────────────────────────────
  app.get('/', (_req, res) => {
    res.json({
      service: 'AI Loan Underwriting Backend',
      version: '1.0.0',
      status: 'running',
      docs: '/api/health',
    });
  });

  // ── 404 Handler ───────────────────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      message: 'Route not found',
    });
  });

  // ── Centralized Error Handler (must be last) ──────────────────────────────
  app.use(errorHandler);

  return app;
};

export default createApp;
