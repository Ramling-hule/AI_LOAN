'use strict';

const ollamaService = require('../llm/ollamaService');
const logger = require('../../utils/logger');

// ---------------------------------------------------------------------------
// Embedding Service — generates vector embeddings for text.
// Uses Ollama's /api/embeddings endpoint internally.
// Designed to be swappable (e.g. replace with OpenAI embeddings in future).
// ---------------------------------------------------------------------------

/**
 * Generate an embedding vector for a single text string.
 * @param {string} text
 * @param {string} [model] - Override the default embedding model
 * @returns {Promise<number[]>} Embedding vector
 */
const embed = async (text, model = undefined) => {
  if (!text || typeof text !== 'string') {
    throw new Error('EmbeddingService: text must be a non-empty string');
  }

  logger.debug(`Generating embedding for ${text.length} chars`);
  return ollamaService.embed(text, model);
};

/**
 * Generate embedding vectors for multiple texts.
 * Processes in batches to avoid overwhelming the LLM.
 * @param {string[]} texts
 * @param {number}   [batchSize=10]
 * @returns {Promise<number[][]>} Array of embedding vectors
 */
const embedBatch = async (texts, batchSize = 10) => {
  const results = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    logger.debug(`Embedding batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(texts.length / batchSize)}`);

    const batchEmbeddings = await Promise.all(batch.map((text) => embed(text)));
    results.push(...batchEmbeddings);
  }

  return results;
};

/**
 * Chunk text into smaller segments for embedding.
 * @param {string} text
 * @param {number} [chunkSize=500]   - Characters per chunk
 * @param {number} [chunkOverlap=50] - Overlap between chunks
 * @returns {string[]}
 */
const chunkText = (text, chunkSize = 500, chunkOverlap = 50) => {
  if (!text) {
    return [];
  }

  const chunks = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end).trim());
    start += chunkSize - chunkOverlap;
  }

  return chunks.filter((c) => c.length > 0);
};

module.exports = { embed, embedBatch, chunkText };
