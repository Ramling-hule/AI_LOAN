'use strict';

const { ChromaClient } = require('chromadb');

const env = require('../../config/env');
const logger = require('../../utils/logger');

// ---------------------------------------------------------------------------
// ChromaDB Vector Store Service
// Wraps the ChromaDB JS client for document embedding storage and retrieval.
// ---------------------------------------------------------------------------

let _client = null;
let _collection = null;

/**
 * Get or create the ChromaDB client (singleton).
 */
const getClient = () => {
  if (!_client) {
    _client = new ChromaClient({
      path: `http://${env.CHROMA_HOST}:${env.CHROMA_PORT}`,
    });
  }
  return _client;
};

/**
 * Get or create the loan documents collection.
 * @returns {Promise<import('chromadb').Collection>}
 */
const getCollection = async () => {
  if (_collection) {
    return _collection;
  }

  const client = getClient();
  _collection = await client.getOrCreateCollection({
    name: env.CHROMA_COLLECTION_NAME,
    metadata: {
      'hnsw:space': env.CHROMA_DISTANCE_FUNCTION,
      description: 'Loan document embeddings for semantic search',
    },
  });

  logger.info(`✅  ChromaDB collection ready: ${env.CHROMA_COLLECTION_NAME}`);
  return _collection;
};

/**
 * Ping ChromaDB to verify connectivity.
 */
const ping = async () => {
  const client = getClient();
  const heartbeat = await client.heartbeat();
  logger.info(`✅  ChromaDB connected. Heartbeat: ${heartbeat}`);
  return heartbeat;
};

/**
 * Add document embeddings to the collection.
 * @param {object} params
 * @param {string[]} params.ids        - Unique IDs for each document chunk
 * @param {number[][]} params.embeddings - Embedding vectors
 * @param {string[]} params.documents  - Original text content
 * @param {object[]} [params.metadatas] - Optional metadata per chunk
 */
const addDocuments = async ({ ids, embeddings, documents, metadatas = [] }) => {
  const collection = await getCollection();

  await collection.add({
    ids,
    embeddings,
    documents,
    metadatas: metadatas.length ? metadatas : undefined,
  });

  logger.info(`ChromaDB: Added ${ids.length} document chunks`);
};

/**
 * Query the collection for similar documents.
 * @param {number[]} queryEmbedding - Query embedding vector
 * @param {number}   nResults       - Number of results to return
 * @param {object}   [where]        - Metadata filter
 * @returns {Promise<import('chromadb').QueryResponse>}
 */
const queryDocuments = async (queryEmbedding, nResults = 5, where = undefined) => {
  const collection = await getCollection();

  const results = await collection.query({
    queryEmbeddings: [queryEmbedding],
    nResults,
    where,
  });

  return results;
};

/**
 * Delete documents by IDs.
 * @param {string[]} ids
 */
const deleteDocuments = async (ids) => {
  const collection = await getCollection();
  await collection.delete({ ids });
  logger.info(`ChromaDB: Deleted ${ids.length} document chunks`);
};

module.exports = { getClient, getCollection, ping, addDocuments, queryDocuments, deleteDocuments };
