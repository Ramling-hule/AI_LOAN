import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import { fileURLToPath } from 'url';

import env from '../config/env.js';




const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);








const { combine, timestamp, errors, json, colorize, printf, splat } = winston.format;


const devFormat = printf(({ level, message, timestamp: ts, stack, ...meta }) => {
  const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
  return `${ts} [${level}]: ${stack || message}${metaStr}`;
});

const commonFormats = [timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), errors({ stack: true }), splat()];

const isDev = env.NODE_ENV === 'development';


const transports = [
  
  new winston.transports.Console({
    format: isDev
      ? combine(...commonFormats, colorize({ all: true }), devFormat)
      : combine(...commonFormats, json()),
  }),

  
  new DailyRotateFile({
    dirname: path.join(process.cwd(), env.LOG_DIR),
    filename: 'combined-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '14d',
    format: combine(...commonFormats, json()),
  }),

  
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
  
  exitOnError: false,
});


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
