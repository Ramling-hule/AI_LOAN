import {
  createOcrJob, findOcrJobById, findOcrJobs, updateOcrJobStatus,
  markOcrJobVectorized, resetOcrJobForRetry,
} from '../db/queries/ocrJobs.queries.js';
import { deleteChunksBySourceDocument } from '../db/queries/embeddings.queries.js';

class OcrJobRepository {
  async createJob(data) {
    return createOcrJob(data);
  }

  async findById(jobId) {
    return findOcrJobById(jobId);
  }

  async findJobs(filters) {
    return findOcrJobs(filters);
  }

  async updateStatus(jobId, updates) {
    return updateOcrJobStatus(jobId, updates);
  }

  async markVectorized(jobId, payload) {
    return markOcrJobVectorized(jobId, payload);
  }

  async resetForRetry(jobId) {
    return resetOcrJobForRetry(jobId);
  }

  async deleteVectorChunks(jobId) {
    return deleteChunksBySourceDocument(jobId);
  }
}

export default new OcrJobRepository(); 
