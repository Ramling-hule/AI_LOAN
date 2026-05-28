'use strict';

const { z } = require('zod');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  AI_SERVICE_PORT: z.coerce.number().default(5001),

  // Ollama
  OLLAMA_BASE_URL: z.string().url().default('http://localhost:11434'),
  OLLAMA_DEFAULT_MODEL: z.string().default('llama3'),
  OLLAMA_TIMEOUT_MS: z.coerce.number().default(120000),

  // ChromaDB
  CHROMA_HOST: z.string().default('localhost'),
  CHROMA_PORT: z.coerce.number().default(8000),
  CHROMA_COLLECTION_NAME: z.string().default('loan_documents'),
  CHROMA_DISTANCE_FUNCTION: z.enum(['cosine', 'l2', 'ip']).default('cosine'),

  // Tesseract
  TESSERACT_LANG: z.string().default('eng'),
  TESSERACT_OEM: z.coerce.number().default(1),
  TESSERACT_PSM: z.coerce.number().default(3),

  // Temp uploads
  TEMP_UPLOAD_DIR: z.string().default('tmp/uploads'),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),
  LOG_DIR: z.string().default('logs'),
});

const _parsed = envSchema.safeParse(process.env);

if (!_parsed.success) {
  console.error('❌  Invalid AI service environment variables:\n', _parsed.error.format());
  process.exit(1);
}

module.exports = _parsed.data;
