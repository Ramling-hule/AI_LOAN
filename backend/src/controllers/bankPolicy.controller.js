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






export const getPolicies = asyncHandler(async (req, res) => {
  const bankName = req.user.bank_name;

  
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

  
  const policyDoc = await createPolicy({
    bank_name: req.user.bank_name,
    title: title.trim(),
    description: description ? description.trim() : '',
    filename: file.originalname,
    url: uploadResult.secure_url,
    public_id: uploadResult.public_id,
    size: file.size,
    mimetype: file.mimetype,
    uploaded_by: req.user.id,
    uploaded_by_name: req.user.admin_name,
    is_system_default: false,
  });

  try {
    const job = await OcrService.submitJob({
      fileBuffer: file.buffer,
      filename: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
      submittedBy: req.user.id,
      submittedByName: req.user.admin_name,
      applicationId: `BANK_${req.user.bank_name}`, 
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

  
  await deletePolicyFromDb(id);

  
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
