'use strict';

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

// Inline env read here to avoid circular dep during early bootstrap
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_DIR = process.env.LOG_DIR || 'logs';
const NODE_ENV = process.env.NODE_ENV || 'development';

const { combine, timestamp, errors, json, colorize, printf, splat } = winston.format;

const devFormat = printf(({ level, message, timestamp: ts, stack }) => {
  return `${ts} [${level}]: ${stack || message}`;
});

const commonFormats = [timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), errors({ stack: true }), splat()];

const logger = winston.createLogger({
  level: LOG_LEVEL,
  transports: [
    new winston.transports.Console({
      format:
        NODE_ENV === 'development'
          ? combine(...commonFormats, colorize({ all: true }), devFormat)
          : combine(...commonFormats, json()),
    }),
    new DailyRotateFile({
      dirname: path.join(process.cwd(), LOG_DIR),
      filename: 'ai-combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      format: combine(...commonFormats, json()),
    }),
    new DailyRotateFile({
      level: 'error',
      dirname: path.join(process.cwd(), LOG_DIR),
      filename: 'ai-error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      format: combine(...commonFormats, json()),
    }),
  ],
  exitOnError: false,
});

module.exports = logger;
