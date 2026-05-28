'use strict';

const morgan = require('morgan');

const logger = require('../utils/logger');

const morganStream = { write: (msg) => logger.http(msg.trim()) };

const requestLogger = morgan(':method :url :status :response-time ms', {
  stream: morganStream,
  skip: (req) => req.url === '/health' || req.url === '/api/health',
});

module.exports = requestLogger;
