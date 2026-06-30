import axios from 'axios';
import env from '../../config/env.js';

class AiServiceClient {
  constructor() {
    this.client = axios.create({
      baseURL: env.AI_SERVICE_URL,
      timeout: 600_000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async processOcr(formData) {
    return this.client.post('/api/v1/ocr/process', formData, {
      headers: { ...formData.getHeaders() },
      timeout: 10_000,
    });
  }

  async getOcrJobStatus(jobId) {
    return this.client.get(`/api/v1/ocr/jobs/${jobId}`);
  }

  async retryOcrJob(jobId) {
    return this.client.post(`/api/v1/ocr/retry/${jobId}`);
  }

  async assessUnderwriting(payload) {
    return this.client.post('/api/v1/underwriting/assess', payload);
  }

  async preemptQueue(loanId, payload) {
    return this.client.post(`/api/v1/queue/preempt/${loanId}`, payload);
  }

  async getQueueJobStatus(jobId) {
    return this.client.get(`/api/v1/queue/status/${jobId}`);
  }
}

export default new AiServiceClient(); 
