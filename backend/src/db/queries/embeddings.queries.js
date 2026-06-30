import supabase from '../supabaseClient.js';
import logger from '../../utils/logger.js';







export const upsertDocumentChunks = async (chunks) => {
  if (!chunks || chunks.length === 0) return;

  
  if (chunks[0]?.source_document) {
    await deleteChunksBySourceDocument(chunks[0].source_document);
  }

  
  const records = chunks.map(chunk => ({
    application_id: chunk.application_id,
    source_document: chunk.source_document,
    document_type: chunk.document_type || 'general',
    document_name: chunk.document_name || '',
    chunk_index: chunk.chunk_index || 0,
    page_number: chunk.page_number || null,
    chunk_text: chunk.chunk_text,
    embedding: chunk.embedding, 
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


export const querySimilarChunks = async (queryEmbedding, applicationId, limit = 15) => {
  
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


export const isDocumentVectorized = async (sourceDocumentId) => {
  const count = await getChunkCount(sourceDocumentId);
  return count > 0;
};


export const getEmbeddingStats = async () => {
  
  
  const { count: total_chunks, error: chunksError } = await supabase
    .from('document_embeddings')
    .select('*', { count: 'exact', head: true });

  if (chunksError) throw chunksError;

  
  return {
    total_chunks: total_chunks || 0,
    total_applications: 0 
  };
};
