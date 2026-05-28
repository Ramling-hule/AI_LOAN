'use strict';

const express = require('express');

const router = express.Router();

// Health check
router.get('/health', async (_req, res) => {
  res.json({
    status: 'ok',
    service: 'ai-services',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Placeholder AI endpoints — add controllers as features are built
// router.use('/v1/ocr',        ocrRoutes);
// router.use('/v1/llm',        llmRoutes);
// router.use('/v1/embeddings', embeddingRoutes);
// router.use('/v1/search',     searchRoutes);

module.exports = router;
