import axios from 'axios';

import env from '../../config/env.js';
import logger from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Ollama Service — REST client for local LLM inference.
// Docs: https://github.com/ollama/ollama/blob/main/docs/api.md
// ---------------------------------------------------------------------------

const ollamaClient = axios.create({
  baseURL: env.OLLAMA_BASE_URL,
  timeout: env.OLLAMA_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' },
});

let availableModels = [];

/**
 * Check if Ollama is reachable and the default model is available.
 */
const ping = async () => {
  try {
    const response = await ollamaClient.get('/api/tags');
    availableModels = response.data?.models?.map((m) => m.name) || [];
    logger.info(`✅  Ollama connected. Available models: ${availableModels.join(', ') || 'none'}`);
    return availableModels;
  } catch (err) {
    logger.error(`❌  Ollama connection failed: ${err.message}`);
    return [];
  }
};

/**
 * Helper to resolve the correct model name based on what's actually pulled in Ollama.
 */
const resolveModelName = async (requestedModel) => {
  if (availableModels.length === 0) {
    await ping();
  }

  if (availableModels.includes(requestedModel)) {
    return requestedModel;
  }

  // Look for exact matches with ':latest' added or partial matches
  const matched = availableModels.find(
    (m) => m === `${requestedModel}:latest` || m.startsWith(requestedModel)
  );

  if (matched) {
    logger.warn(`⚠️ Model '${requestedModel}' not found in tags. Auto-resolving to '${matched}'`);
    return matched;
  }

  // Fallback to first available model if any exists
  if (availableModels.length > 0) {
    logger.warn(`⚠️ Model '${requestedModel}' not found. Falling back to first available: '${availableModels[0]}'`);
    return availableModels[0];
  }

  return requestedModel;
};

/**
 * Generate a completion using the default (or specified) model.
 * @param {string} prompt
 * @param {string} [model]
 * @param {object} [options] - Ollama generation options
 * @returns {Promise<string>} Generated text
 */
const generate = async (prompt, model = env.OLLAMA_DEFAULT_MODEL, options = {}) => {
  const resolvedModel = await resolveModelName(model);
  logger.debug(`Ollama generate — model: ${resolvedModel}`);

  const response = await ollamaClient.post('/api/generate', {
    model: resolvedModel,
    prompt,
    stream: false,
    options,
  });

  return response.data.response;
};

/**
 * Chat completion (multi-turn) using the default model.
 * @param {Array<{role: string, content: string}>} messages
 * @param {string} [model]
 * @param {object} [options]
 * @returns {Promise<string>} Assistant reply
 */
const chat = async (messages, model = env.OLLAMA_DEFAULT_MODEL, options = {}) => {
  const resolvedModel = await resolveModelName(model);
  logger.debug(`Ollama chat — model: ${resolvedModel}, messages: ${messages.length}`);

  const response = await ollamaClient.post('/api/chat', {
    model: resolvedModel,
    messages,
    stream: false,
    options,
  });

  return response.data.message?.content;
};

/**
 * Generate embeddings for a given text.
 * @param {string} text
 * @param {string} [model]
 * @returns {Promise<number[]>} Embedding vector
 */
const embed = async (text, model = env.OLLAMA_DEFAULT_MODEL) => {
  const resolvedModel = await resolveModelName(model);
  const response = await ollamaClient.post('/api/embeddings', {
    model: resolvedModel,
    prompt: text,
  });

  return response.data.embedding;
};

export { ping, generate, chat, embed };
