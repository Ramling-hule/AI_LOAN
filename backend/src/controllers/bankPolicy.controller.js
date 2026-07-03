import { v4 as uuidv4 } from 'uuid';

import {
  findPoliciesForBank,
  createPolicy,
  findPolicyById,
  updatePolicy as updatePolicyInDb,
  deletePolicy as deletePolicyFromDb,
} from '../db/queries/policies.queries.js';
import { cloudinary } from '../config/cloudinary.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import logger from '../utils/logger.js';
import { recordAuditLog } from '../db/queries/auditLogs.queries.js';
import axios from 'axios';
import OcrService from '../services/ocr.service.js';
import { redisClient } from '../config/redis.js';


const AI_SERVICES_URL = process.env.AI_SERVICES_URL || 'http://localhost:8000';





const uploadToCloudinary = (fileBuffer, originalName, _mimeType) => {
  return new Promise((resolve, reject) => {
    const baseName = originalName.split('.')[0].replace(/[^a-zA-Z0-9]/g, '_');
    const folder = 'capitalscale_bank_policies';
    const publicId = `${Date.now()}_${baseName}`;

    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: 'auto',
      },
      (error, result) => {
        if (error) {
          logger.error('Cloudinary Upload Stream Error:', error);
          return reject(error);
        }
        resolve(result);
      }
    );

    stream.end(fileBuffer);
  });
};

const deleteFromCloudinary = (publicId) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(publicId, (error, result) => {
      if (error) {
        logger.error('Cloudinary Destroy Error:', error);
        return reject(error);
      }
      resolve(result);
    });
  });
};






import { findBankAdminById } from '../db/queries/users.queries.js';

export const getPolicies = asyncHandler(async (req, res) => {
  let bankName = req.user.bank_name;
  if (!bankName && req.user.role === 'bank_admin') {
    const admin = await findBankAdminById(req.user.id);
    if (admin) bankName = admin.bank_name;
  }
  
  const policies = await findPoliciesForBank(bankName);

  return ApiResponse.ok(policies, 'Bank policy documents retrieved successfully').send(res);
});


export const uploadPolicy = asyncHandler(async (req, res) => {
  const { title, description } = req.body;
  const file = req.file;

  if (!title || !title.trim()) {
    throw new ApiError(400, 'Policy title is required');
  }

  if (!file) {
    throw new ApiError(400, 'Policy document file upload is required');
  }

  
  const allowedMimeTypes = ['application/pdf'];
  if (!allowedMimeTypes.includes(file.mimetype)) {
    throw new ApiError(400, 'Only PDF format is allowed for policy documents');
  }

  
  const uploadResult = await uploadToCloudinary(file.buffer, file.originalname, file.mimetype);

  let bankName = req.user.bank_name;
  let adminName = req.user.admin_name;
  if (!bankName && req.user.role === 'bank_admin') {
    const admin = await findBankAdminById(req.user.id);
    if (admin) {
      bankName = admin.bank_name;
      adminName = admin.admin_name;
    }
  }

  
  const policyDoc = await createPolicy({
    bank_name: bankName,
    title: title.trim(),
    description: description ? description.trim() : '',
    filename: file.originalname,
    url: uploadResult.secure_url,
    public_id: uploadResult.public_id,
    size: file.size,
    mimetype: file.mimetype,
    uploaded_by: req.user.id,
    uploaded_by_name: adminName,
    is_system_default: false,
  });

  try {
    const job = await OcrService.submitJob({
      fileBuffer: file.buffer,
      filename: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
      submittedBy: req.user.id,
      submittedByName: adminName,
      applicationId: `BANK_${bankName}`, 
      documentType: 'bank_policy',
      documentUrl: uploadResult.secure_url,
    });
    if (job && job.job_id) {
      await updatePolicyInDb(policyDoc.id, { ocr_job_id: job.job_id });
      logger.info(`[BankPolicy] Successfully queued policy ${policyDoc.id} for OCR and embedding (Job: ${job.job_id})`);
    }
  } catch (err) {
    logger.warn(`[BankPolicy] Failed to queue policy ${policyDoc.id} for processing: ${err.message}`);
  }

  
  recordAuditLog({
    actor_id: req.user.id,
    actor_ref_model: 'BankAdminUser',
    actor_email: req.user.email,
    action: 'bank.upload_policy',
    method: 'POST',
    resource_path: req.originalUrl,
    resource_id: policyDoc.id,
    resource_model: 'BankPolicyDocument',
    status: 'success',
    status_code: 201,
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
  }).catch(() => {});

  return ApiResponse.created(policyDoc, 'Confidential policy document uploaded successfully').send(res);
});


export const extractPolicyRules = asyncHandler(async (req, res) => {
  const policy = await findPolicyById(req.params.id);
  if (!policy) throw new ApiError(404, 'Policy not found');

  let bankName = req.user.bank_name;
  let adminName = req.user.admin_name;
  if (!bankName && req.user.role === 'bank_admin') {
    const admin = await findBankAdminById(req.user.id);
    if (admin) {
      bankName = admin.bank_name;
      adminName = admin.admin_name;
    }
  }

  // Fetch the PDF from Cloudinary to send to the OCR service
  const response = await axios.get(policy.url, { responseType: 'arraybuffer' });
  const fileBuffer = Buffer.from(response.data);

  const job = await OcrService.submitJob({
    fileBuffer,
    filename: policy.filename,
    mimeType: policy.mimetype,
    fileSize: policy.size,
    submittedBy: req.user.id,
    submittedByName: adminName,
    applicationId: `BANK_${bankName}`, 
    documentType: 'bank_policy',
    documentUrl: policy.url,
    extractOnly: true,
  });

  if (job && job.job_id) {
    await updatePolicyInDb(policy.id || policy._id, { ocr_job_id: job.job_id });
    logger.info(`[BankPolicy] Successfully re-queued policy ${policy.id} for extraction (Job: ${job.job_id})`);
  }

  recordAuditLog({
    actor_id: req.user.id,
    actor_email: req.user.email,
    action: 'EXTRACT_POLICY_RULES',
    resource_model: 'Policy',
    resource_id: policy.id || policy._id,
    method: 'POST',
    resource_path: `/api/v1/bank-policies/${policy.id || policy._id}/extract`,
    status: 'success',
    status_code: 200,
    ip_address: req.ip,
    user_agent: req.headers['user-agent']
  });

  return ApiResponse.ok({ job_id: job?.job_id }, 'Extraction job submitted').send(res);
});


export const deletePolicy = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const policy = await findPolicyById(id);
  if (!policy) {
    throw new ApiError(404, 'Policy document not found');
  }

  if (policy.is_system_default) {
    throw new ApiError(403, 'System default policies cannot be deleted');
  }

  
  if (policy.bank_name !== req.user.bank_name) {
    throw new ApiError(403, 'Access denied. You cannot delete policies uploaded by another bank');
  }

  
  try {
    await deleteFromCloudinary(policy.public_id);
  } catch (err) {
    logger.error(`Failed to delete asset ${policy.public_id} from Cloudinary during cleanup:`, err);
  }

  
  await deletePolicyFromDb(id, policy.bank_name);

  if (redisClient) {
    try {
      const keys = await redisClient.keys(`${policy.bank_name}:*`);
      if (keys && keys.length > 0) {
        await redisClient.del(...keys);
      }
    } catch (err) {
      logger.error('Failed to clear Python policy cache from Redis:', err);
    }
  }

  
  recordAuditLog({
    actor_id: req.user.id,
    actor_ref_model: 'BankAdminUser',
    actor_email: req.user.email,
    action: 'bank.delete_policy',
    method: 'DELETE',
    resource_path: req.originalUrl,
    resource_id: id,
    resource_model: 'BankPolicyDocument',
    status: 'success',
    status_code: 200,
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
  }).catch(() => {});

  return ApiResponse.ok(null, 'Policy document deleted successfully').send(res);
});


export const updatePolicy = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { title, description } = req.body;
  const file = req.file;

  const policy = await findPolicyById(id);
  if (!policy) {
    throw new ApiError(404, 'Policy document not found');
  }

  
  if (!policy.is_system_default && policy.bank_name !== req.user.bank_name) {
    throw new ApiError(403, 'Access denied. You cannot edit policies uploaded by another bank');
  }

  const updates = {};
  if (title && title.trim()) {
    updates.title = title.trim();
  }
  if (description !== undefined) {
    updates.description = description.trim();
  }

  if (file) {
    
    const allowedMimeTypes = ['application/pdf'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new ApiError(400, 'Only PDF format is allowed for policy documents');
    }

    
    if (policy.public_id && !policy.public_id.startsWith('capitalscale_bank_policies/default_policy_')) {
      try {
        await deleteFromCloudinary(policy.public_id);
      } catch (err) {
        logger.error(`Failed to delete old asset ${policy.public_id} from Cloudinary:`, err);
      }
    }

    
    const uploadResult = await uploadToCloudinary(file.buffer, file.originalname, file.mimetype);
    updates.filename = file.originalname;
    updates.url = uploadResult.secure_url;
    updates.public_id = uploadResult.public_id;
    updates.size = file.size;
    updates.mimetype = file.mimetype;

    
    updates.content = null;
  }

  const updatedPolicy = await updatePolicyInDb(id, updates);

  
  if (updates.title || updates.description !== undefined) {
    try {
      const finalTitle = updates.title || policy.title || '';
      const finalDesc = updates.description !== undefined ? updates.description : (policy.description || '');
      const textToEmbed = `${finalTitle} ${finalDesc}`.trim();
      if (textToEmbed) {
        const embedResponse = await axios.post(`${AI_SERVICES_URL}/api/v1/embed`, { text: textToEmbed });
        if (embedResponse.data && embedResponse.data.embedding) {
          await updatePolicyInDb(id, { query_embedding: embedResponse.data.embedding });
          logger.info(`[BankPolicy] Successfully generated and stored updated embedding for policy ${id}`);
        }
      }
    } catch (err) {
      logger.warn(`[BankPolicy] Failed to generate embedding for policy ${id}: ${err.message}`);
    }
  }

  
  recordAuditLog({
    actor_id: req.user.id,
    actor_ref_model: 'BankAdminUser',
    actor_email: req.user.email,
    action: 'bank.update_policy',
    method: 'PUT',
    resource_path: req.originalUrl,
    resource_id: id,
    resource_model: 'BankPolicyDocument',
    status: 'success',
    status_code: 200,
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
  }).catch(() => {});

  return ApiResponse.ok(updatedPolicy, 'Confidential policy document updated successfully').send(res);
});

export const getBankPolicies = asyncHandler(async (req, res) => {
  const { bankName } = req.params;
  const policies = await findPoliciesForBank(bankName);
  return ApiResponse.ok(policies, 'Bank policy documents retrieved successfully').send(res);
});

export const chatWithPolicy = asyncHandler(async (req, res) => {
  const { bankName } = req.params;
  const { query } = req.body;

  if (!query) throw new ApiError(400, 'Query is required');

  const aiClient = axios.create({
    baseURL: process.env.AI_SERVICE_URL || 'http://127.0.0.1:5001',
    timeout: 30000,
  });

  try {
    const response = await aiClient.post(`/api/v1/chat/policy/${encodeURIComponent(bankName)}`, { query });
    return res.json(response.data);
  } catch (error) {
    logger.error(`[Policy Chat] Proxy error: ${error.message}`);
    if (error.response) {
      if (error.response.status === 429) {
        return res.status(429).json({
          success: false,
          message: error.response.data?.detail?.message || 'AI Engine rate limited',
          retry_after: error.response.data?.detail?.retry_after || 30
        });
      }
      return res.status(error.response.status).json({
        success: false,
        message: error.response.data?.detail || error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: `Failed to connect to AI chat service: ${error.message}`
    });
  }
});


