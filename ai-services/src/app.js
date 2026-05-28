'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const requestLogger = require('./middleware/requestLogger');
const errorHandler = require('./middleware/errorHandler');
const routes = require('./routes');

const createApp = () => {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: '*' }));
  app.use(express.json({ limit: '50mb' })); // larger limit for document data
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));
  app.use(requestLogger);

  // Routes
  app.use('/api', routes);

  // Root
  app.get('/', (_req, res) => {
    res.json({ service: 'AI Loan Underwriting — AI Services', version: '1.0.0', status: 'running' });
  });

  // 404
  app.use((_req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
  });

  // Error handler (last)
  app.use(errorHandler);

  return app;
};

module.exports = createApp;
