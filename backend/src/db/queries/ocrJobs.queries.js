import supabase from '../supabaseClient.js';
import { v4 as uuidv4 } from 'uuid';






export const createOcrJob = async ({
  jobId, status = 'queued', document_name, document_url, file_size,
  mime_type, submitted_by, submitted_by_name, application_id,
  document_type = 'general', ocr_config = {},
}) => {
  const id = jobId || uuidv4();
  const defaultConfig = { lang: 'eng', oem: 1, psm: 3, enhance_image: true, extract_tables: true };
  
  const initialLog = [{
    timestamp: new Date().toISOString(),
    level: 'info',
    step: 'job_submitted',
    message: `Job submitted. File: ${document_name} (${mime_type})`,
  }];

  const { data, error } = await supabase
    .from('ocr_jobs')
    .insert({
      id, job_id: id, status, document_name, document_url: document_url || null, 
      file_size: file_size || null, mime_type, submitted_by: submitted_by || null, 
      submitted_by_name: submitted_by_name || null, application_id: application_id || '',
      document_type, ocr_config: { ...defaultConfig, ...ocr_config },
      processing_log: initialLog, queued_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const findOcrJobById = async (jobId) => {
  const { data, error } = await supabase
    .from('ocr_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (error && error.code !== 'PGRST116') throw error; 
  return data || null;
};

export const findOcrJobs = async ({ submitted_by, status, limit = 50, page = 1 }) => {
  let query = supabase
    .from('ocr_jobs')
    .select(`
      id, job_id, status, document_name, document_url, file_size, mime_type,
      submitted_by, submitted_by_name, application_id, document_type,
      page_count, pdf_type, is_vectorized, vector_chunk_count,
      processing_time_ms, queued_at, started_at, completed_at, created_at
    `, { count: 'exact' });

  if (submitted_by) query = query.eq('submitted_by', submitted_by);
  if (status) query = query.eq('status', status);

  const offset = (page - 1) * limit;
  query = query.order('created_at', { ascending: false })
               .range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  
  if (error) throw error;

  return {
    jobs: data || [],
    total: count || 0,
    page,
    limit,
  };
};

export const updateOcrJobStatus = async (jobId, updates) => {
  const allowed = ['status', 'page_count', 'pdf_type', 'attempts', 'processing_time_ms', 'started_at', 'completed_at', 'ocr_result', 'error_info'];
  const updatePayload = {};
  
  for (const field of allowed) {
    if (updates[field] !== undefined) {
      updatePayload[field] = updates[field];
    }
  }

  if (Object.keys(updatePayload).length === 0) return findOcrJobById(jobId);

  const { data, error } = await supabase
    .from('ocr_jobs')
    .update(updatePayload)
    .eq('id', jobId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const appendOcrJobLog = async (jobId, logEntry) => {
  
  const job = await findOcrJobById(jobId);
  if (!job) return;

  const currentLog = job.processing_log || [];
  currentLog.push(logEntry);

  const { error } = await supabase
    .from('ocr_jobs')
    .update({ processing_log: currentLog })
    .eq('id', jobId);

  if (error) throw error;
};

export const markOcrJobVectorized = async (jobId, { success, chunk_count, vectorized_at, error, document_type }) => {
  const job = await findOcrJobById(jobId);
  if (!job) return null;

  const currentLog = job.processing_log || [];
  
  if (success) {
    currentLog.push({ 
      timestamp: new Date().toISOString(), level: 'info', 
      step: 'vectorization_complete', message: `${chunk_count || 0} chunks stored in pgvector` 
    });

    const { data, error: updateError } = await supabase
      .from('ocr_jobs')
      .update({
        is_vectorized: true,
        vectorized_at: vectorized_at || new Date().toISOString(),
        vector_chunk_count: chunk_count || 0,
        vectorization_error: null,
        processing_log: currentLog
      })
      .eq('id', jobId)
      .select()
      .single();

    if (updateError) throw updateError;
    return data;
  } else {
    currentLog.push({ 
      timestamp: new Date().toISOString(), level: 'warn', 
      step: 'vectorization_failed', message: error || 'unknown error' 
    });

    const { data, error: updateError } = await supabase
      .from('ocr_jobs')
      .update({
        is_vectorized: false,
        vectorization_error: error || 'Unknown vectorization error',
        processing_log: currentLog
      })
      .eq('id', jobId)
      .select()
      .single();

    if (updateError) throw updateError;
    return data;
  }
};

export const resetOcrJobForRetry = async (jobId) => {
  const job = await findOcrJobById(jobId);
  if (!job || job.status !== 'failed') return null;

  const currentLog = job.processing_log || [];
  currentLog.push({ 
    timestamp: new Date().toISOString(), level: 'info', 
    step: 'manual_retry', message: 'Job manually re-queued via backend API' 
  });

  const { data, error } = await supabase
    .from('ocr_jobs')
    .update({
      status: 'queued',
      attempts: 0,
      error_info: null,
      processing_log: currentLog
    })
    .eq('id', jobId)
    .select()
    .single();

  if (error) throw error;
  return data;
};
