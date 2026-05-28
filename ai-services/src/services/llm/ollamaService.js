'use strict';

const axios = require('axios');

const env = require('../../config/env');
const logger = require('../../utils/logger');

// ---------------------------------------------------------------------------
// Ollama Service — REST client for local LLM inference.
// Docs: https://github.com/ollama/ollama/blob/main/docs/api.md
// ---------------------------------------------------------------------------

const ollamaClient = axios.create({
  baseURL: env.OLLAMA_BASE_URL,
  timeout: env.OLLAMA_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Check if Ollama is reachable and the default model is available.
 */
const ping = async () => {
  const response = await ollamaClient.get('/api/tags');
  const models = response.data?.models?.map((m) => m.name) || [];
  logger.info(`✅  Ollama connected. Available models: ${models.join(', ') || 'none'}`);
  return models;
};

/**
 * Generate a completion using the default (or specified) model.
 * @param {string} prompt
 * @param {string} [model]
 * @param {object} [options] - Ollama generation options
 * @returns {Promise<string>} Generated text
 */
const generate = async (prompt, model = env.OLLAMA_DEFAULT_MODEL, options = {}) => {
  logger.debug(`Ollama generate — model: ${model}`);

  const response = await ollamaClient.post('/api/generate', {
    model,
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
  logger.debug(`Ollama chat — model: ${model}, messages: ${messages.length}`);

  const response = await ollamaClient.post('/api/chat', {
    model,
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
  const response = await ollamaClient.post('/api/embeddings', {
    model,
    prompt: text,
  });

  return response.data.embedding;
};

module.exports = { ping, generate, chat, embed };
