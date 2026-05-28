import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import { fileURLToPath } from 'url';

import env from '../config/env.js';

// ---------------------------------------------------------------------------
// ESM-compatible __dirname equivalent
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Winston logger with:
//   - Console transport (colorized in dev, JSON in prod)
//   - Daily rotating file transport for errors
//   - Daily rotating file transport for all logs
// ---------------------------------------------------------------------------

const { combine, timestamp, errors, json, colorize, printf, splat } = winston.format;

// Custom dev format
const devFormat = printf(({ level, message, timestamp: ts, stack, ...meta }) => {
  const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
  return `${ts} [${level}]: ${stack || message}${metaStr}`;
});

const commonFormats = [timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), errors({ stack: true }), splat()];

const isDev = env.NODE_ENV === 'development';

// Transports
const transports = [
  // Console
  new winston.transports.Console({
    format: isDev
      ? combine(...commonFormats, colorize({ all: true }), devFormat)
      : combine(...commonFormats, json()),
  }),

  // Rotating file — all logs
  new DailyRotateFile({
    dirname: path.join(process.cwd(), env.LOG_DIR),
    filename: 'combined-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '14d',
    format: combine(...commonFormats, json()),
  }),

  // Rotating file — errors only
  new DailyRotateFile({
    level: 'error',
    dirname: path.join(process.cwd(), env.LOG_DIR),
    filename: 'error-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '30d',
    format: combine(...commonFormats, json()),
  }),
];

const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  transports,
  // Don't exit on handled exceptions
  exitOnError: false,
});

// Unhandled rejections
logger.exceptions.handle(
  new DailyRotateFile({
    dirname: path.join(process.cwd(), env.LOG_DIR),
    filename: 'exceptions-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '30d',
    format: combine(...commonFormats, json()),
  })
);

export default logger;
