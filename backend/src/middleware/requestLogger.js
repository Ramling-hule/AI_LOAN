import morgan from 'morgan';

import logger from '../utils/logger.js';

// ---------------------------------------------------------------------------
// HTTP request logger middleware using morgan.
// Streams morgan output through Winston so all logs are in one place.
// ---------------------------------------------------------------------------

// Custom morgan token for request ID
morgan.token('req-id', (req) => req.id || '-');

// Log format
const logFormat = ':req-id :method :url :status :res[content-length] - :response-time ms';

const morganStream = {
  write: (message) => logger.http(message.trim()),
};

const requestLogger = morgan(logFormat, {
  stream: morganStream,
  // Skip health-check endpoints to reduce noise
  skip: (req) => req.url === '/health' || req.url === '/api/health',
});

export default requestLogger;
