import supabase from '../supabaseClient.js';
import logger from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// embeddings.queries.js
// Supabase pgvector operations.
// ---------------------------------------------------------------------------

/**
 * Insert a batch of document chunks into Supabase.
 *
 * @param {Array<{
 *   application_id: string,
 *   source_document: string,
 *   document_type: string,
 *   document_name: string,
 *   chunk_index: number,
 *   page_number: number,
 *   chunk_text: string,
 *   embedding: number[],
 *   metadata: object
 * }>} chunks
 */
export const upsertDocumentChunks = async (chunks) => {
  if (!chunks || chunks.length === 0) return;

  // First delete existing chunks for this source document to ensure idempotency
  if (chunks[0]?.source_document) {
    await deleteChunksBySourceDocument(chunks[0].source_document);
  }

  // Format chunks for Supabase insertion
  const records = chunks.map(chunk => ({
    application_id: chunk.application_id,
    source_document: chunk.source_document,
    document_type: chunk.document_type || 'general',
    document_name: chunk.document_name || '',
    chunk_index: chunk.chunk_index || 0,
    page_number: chunk.page_number || null,
    chunk_text: chunk.chunk_text,
    embedding: chunk.embedding, // Supabase JS SDK handles the array to vector conversion natively!
    metadata: chunk.metadata || {}
  }));

  const { error } = await supabase
    .from('document_embeddings')
    .insert(records);

  if (error) {
    logger.error(`[Supabase Error] upsertDocumentChunks: ${error.message}`);
    throw error;
  }
};

/**
 * Retrieve the most similar chunks for a given query embedding.
 *
 * @param {number[]} queryEmbedding - 1536-dim vector
 * @param {string}   applicationId - Filter by application
 * @param {number}   [limit=15]
 * @returns {Promise<Array<{chunk_text: string, score: number, metadata: object}>>}
 */
export const querySimilarChunks = async (queryEmbedding, applicationId, limit = 15) => {
  // Call the Supabase RPC function we created in the SQL Editor
  const { data, error } = await supabase.rpc('match_document_chunks', {
    query_embedding: queryEmbedding,
    match_application_id: applicationId,
    match_limit: limit
  });

  if (error) {
    logger.error(`[Supabase Error] querySimilarChunks: ${error.message}`);
    throw error;
  }

  return (data || []).map(r => ({
    text: r.chunk_text,
    score: r.score,
    metadata: {
      document_name: r.document_name,
      document_type: r.document_type,
      page_number: r.page_number,
      ...(r.metadata || {}),
    },
  }));
};

/**
 * Delete all chunks for a given source document (job_id).
 */
export const deleteChunksBySourceDocument = async (sourceDocumentId) => {
  const { data, error } = await supabase
    .from('document_embeddings')
    .delete()
    .eq('source_document', sourceDocumentId);

  if (error) {
    logger.error(`[Supabase Error] deleteChunksBySourceDocument: ${error.message}`);
    throw error;
  }
  
  return data;
};

/**
 * Count chunks stored for a given source document.
 */
export const getChunkCount = async (sourceDocumentId) => {
  const { count, error } = await supabase
    .from('document_embeddings')
    .select('*', { count: 'exact', head: true })
    .eq('source_document', sourceDocumentId);

  if (error) {
    logger.error(`[Supabase Error] getChunkCount: ${error.message}`);
    throw error;
  }

  return count || 0;
};

/**
 * Check whether a document has any stored embeddings.
 */
export const isDocumentVectorized = async (sourceDocumentId) => {
  const count = await getChunkCount(sourceDocumentId);
  return count > 0;
};

/**
 * Get collection statistics.
 */
export const getEmbeddingStats = async () => {
  // This might require a custom RPC if you need exact distinct application counts,
  // but for basic chunk counting we can do:
  const { count: total_chunks, error: chunksError } = await supabase
    .from('document_embeddings')
    .select('*', { count: 'exact', head: true });

  if (chunksError) throw chunksError;

  // Since getting distinct counts via JS is hard without an RPC, we will return total_chunks
  return {
    total_chunks: total_chunks || 0,
    total_applications: 0 // Placeholder unless an RPC is created
  };
};
