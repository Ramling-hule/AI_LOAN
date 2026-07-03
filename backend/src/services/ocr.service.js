import FormData from 'form-data';
import ApiError from '../utils/ApiError.js';
import logger from '../utils/logger.js';
import aiServiceClient from '../infrastructure/ai/AiServiceClient.js';
import ocrJobRepository from '../repositories/OcrJobRepository.js';
import loanRepository from '../repositories/LoanRepository.js';
import axios from 'axios';

class OcrService {
  constructor(aiClient, ocrRepo, loanRepo) {
    this.aiClient = aiClient;
    this.ocrRepo = ocrRepo;
    this.loanRepo = loanRepo;
  }

  async submitJob({ fileBuffer, filename, mimeType, fileSize, submittedBy, submittedByName, applicationId, documentType, documentUrl, extractOnly }) {
    const job = await this.ocrRepo.createJob({
      document_name: filename,
      document_url: documentUrl || null,
      file_size: fileSize,
      mime_type: mimeType,
      submitted_by: submittedBy,
      submitted_by_name: submittedByName,
      application_id: applicationId,
      document_type: documentType || 'general',
    });

    try {
      const formData = new FormData();
      formData.append('file', fileBuffer, { filename, contentType: mimeType });
      formData.append('job_id', job.job_id);
      formData.append('application_id', applicationId || '');
      formData.append('document_type', documentType || 'general');
      formData.append('document_url', documentUrl || '');
      if (extractOnly) formData.append('extract_only', 'true');

      await this.aiClient.processOcr(formData);
      logger.info(`[OCR] Job ${job.job_id} submitted to Python AI service`);
    } catch (err) {
      logger.warn(`[OCR] Failed to submit job to AI service: ${err.message}. Job will retry.`);
    }

    return job;
  }

  async getJobStatus(jobId, userContext) {
    let job = await this.ocrRepo.findById(jobId);
    if (!job) throw ApiError.notFound('OCR job not found');

    if (userContext.role === 'sme' && job.submitted_by && job.submitted_by !== userContext.id) {
      throw ApiError.forbidden('Not authorized to view this OCR job');
    }

    if (['queued', 'processing'].includes(job.status)) {
      try {
        const response = await this.aiClient.getOcrJobStatus(jobId);
        const aiJob = response.data?.data;
        if (aiJob && aiJob.status !== job.status) {
          await this.ocrRepo.updateStatus(jobId, {
            status: aiJob.status,
            page_count: aiJob.page_count,
            pdf_type: aiJob.pdf_type,
            processing_time_ms: aiJob.processing_time_ms,
            completed_at: aiJob.completed_at ? new Date(aiJob.completed_at) : undefined,
          });
          job = await this.ocrRepo.findById(jobId);
        }
      } catch (err) {
        logger.debug(`[OCR] Sync from AI service failed: ${err.message}`);
      }
    }

    return job;
  }

  async listJobs(userContext, params = {}) {
    const filters = { ...params };
    if (userContext.role === 'sme') filters.submitted_by = userContext.id;
    return this.ocrRepo.findJobs(filters);
  }

  async retryJob(jobId, userContext) {
    if (!['bank_admin', 'super_admin'].includes(userContext.role)) throw ApiError.forbidden('Not authorized to retry jobs');
    const job = await this.ocrRepo.resetForRetry(jobId);
    if (!job) throw ApiError.badRequest('Job cannot be retried — not in failed state');

    try {
      await this.aiClient.retryOcrJob(jobId);
    } catch (err) {
      logger.warn(`[OCR] Retry signal to AI service failed: ${err.message}`);
    }

    return job;
  }

  async handleVectorizationCallback(jobId, payload) {
    const job = await this.ocrRepo.findById(jobId);
    if (!job) { logger.warn(`handleVectorizationCallback: job ${jobId} not found`); return; }

    await this.ocrRepo.markVectorized(jobId, payload);
    logger.info(`[OCR] Job ${jobId} vectorization: success=${payload.success}, chunks=${payload.chunk_count}`);
    return this.ocrRepo.findById(jobId);
  }

  async deleteVectorizedJob(jobId) {
    if (!jobId) return;
    const deleted = await this.ocrRepo.deleteVectorChunks(jobId);
    logger.info(`[OCR] Deleted ${deleted} vector chunks for job ${jobId}`);
  }

  async reprocessLoanDocuments(loanId, userContext) {
    const loan = await this.loanRepo.findById(loanId);
    if (!loan) throw ApiError.notFound('Loan application not found');

    const documentTypes = Object.keys(loan.documents || {});
    if (documentTypes.length === 0) {
      logger.info(`[OCR Reprocess] No documents found for loan ${loanId}`);
      return;
    }

    const jobIds = [];

    for (const docType of documentTypes) {
      const doc = loan.documents[docType];
      if (!doc || !doc.url) continue;

      logger.info(`[OCR Reprocess] Reprocessing document ${docType} for loan ${loanId}`);

      if (doc.ocr_job_id) {
        try {
          await this.ocrRepo.deleteVectorChunks(doc.ocr_job_id);
          logger.info(`[OCR Reprocess] Deleted old vector chunks for job ${doc.ocr_job_id}`);
        } catch (err) {
          logger.warn(`[OCR Reprocess] Failed to delete old chunks for job ${doc.ocr_job_id}: ${err.message}`);
        }
      }

      try {
        const response = await axios.get(doc.url, { responseType: 'arraybuffer' });
        const fileBuffer = Buffer.from(response.data);

        const job = await this.submitJob({
          fileBuffer,
          filename: doc.filename || `${docType}.pdf`,
          mimeType: doc.mimetype || 'application/pdf',
          fileSize: doc.size || fileBuffer.length,
          submittedBy: loan.sme_id?.id || loan.sme_id,
          submittedByName: loan.sme_id?.full_name || 'SME Applicant',
          applicationId: loan.app_id,
          documentType: docType,
          documentUrl: doc.url,
        });

        if (job && job.job_id) {
          jobIds.push(job.job_id);
          const updatedDoc = {
            ...doc,
            ocr_job_id: job.job_id,
            uploaded_at: new Date(),
          };
          await this.loanRepo.setDocument(loanId, docType, updatedDoc);
        }
      } catch (err) {
        logger.error(`[OCR Reprocess] Error downloading or submitting document ${docType}: ${err.message}`);
      }
    }

    if (jobIds.length > 0) {
      logger.info(`[OCR Reprocess] Waiting for ${jobIds.length} OCR jobs to complete...`);
      const startTime = Date.now();
      const timeoutMs = 120_000;
      const pollIntervalMs = 2_000;

      while (Date.now() - startTime < timeoutMs) {
        const statuses = await Promise.all(
          jobIds.map(async (jobId) => {
            try {
              const statusJob = await this.getJobStatus(jobId, userContext);
              return statusJob.status;
            } catch (err) {
              logger.warn(`[OCR Reprocess] Error getting status for job ${jobId}: ${err.message}`);
              return 'failed';
            }
          })
        );

        const allFinished = statuses.every(status => ['completed', 'failed'].includes(status));
        if (allFinished) {
          logger.info(`[OCR Reprocess] All OCR jobs finished processing: ${statuses.join(', ')}`);
          break;
        }

        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      }
    }
  }

  async markJobVectorized(jobId, payload) {
    return this.handleVectorizationCallback(jobId, payload);
  }

  async syncJobStatus(jobId) {
    return this.getJobStatus(jobId, { role: 'super_admin' });
  }

  async getJob(jobId) {
    const job = await this.ocrRepo.findById(jobId);
    if (!job) throw ApiError.notFound('OCR job not found');
    return job;
  }
}

export default new OcrService(aiServiceClient, ocrJobRepository, loanRepository);
