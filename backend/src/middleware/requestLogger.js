import morgan from 'morgan';

import logger from '../utils/logger.js';







morgan.token('req-id', (req) => req.id || '-');


const logFormat = ':req-id :method :url :status :res[content-length] - :response-time ms';

const morganStream = {
  write: (message) => logger.http(message.trim()),
};

const requestLogger = morgan(logFormat, {
  stream: morganStream,
  
  skip: (req) => req.url === '/health' || req.url === '/api/health' || req.url.includes('/queue/status'),
});

export default requestLogger;
