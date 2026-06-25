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

// ---------------------------------------------------------------------------
// Cloudinary Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Controller Handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/v1/bank-policies
 * Fetches all policy guidelines relevant to the logged-in bank admin's bank, including system defaults.
 */
export const getPolicies = asyncHandler(async (req, res) => {
  const bankName = req.user.bank_name;

  // Retrieve default policies and the ones uploaded for the underwriter's bank
  const policies = await findPoliciesForBank(bankName);

  return ApiResponse.ok(policies, 'Bank policy documents retrieved successfully').send(res);
});

/**
 * POST /api/v1/bank-policies
 * Uploads a new policy document (PDF/Image) to Cloudinary and saves metadata.
 */
export const uploadPolicy = asyncHandler(async (req, res) => {
  const { title, description } = req.body;
  const file = req.file;

  if (!title || !title.trim()) {
    throw new ApiError(400, 'Policy title is required');
  }

  if (!file) {
    throw new ApiError(400, 'Policy document file upload is required');
  }

  // Allowed file types: PDF format only
  const allowedMimeTypes = ['application/pdf'];
  if (!allowedMimeTypes.includes(file.mimetype)) {
    throw new ApiError(400, 'Only PDF format is allowed for policy documents');
  }

  // Upload to Cloudinary
  const uploadResult = await uploadToCloudinary(file.buffer, file.originalname, file.mimetype);

  // Save metadata to database
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

  // Record audit log
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

/**
 * DELETE /api/v1/bank-policies/:id
 * Deletes a bank policy document from Cloudinary and database.
 */
export const deletePolicy = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const policy = await findPolicyById(id);
  if (!policy) {
    throw new ApiError(404, 'Policy document not found');
  }

  if (policy.is_system_default) {
    throw new ApiError(403, 'System default policies cannot be deleted');
  }

  // Access check: only creators from the same bank can delete it
  if (policy.bank_name !== req.user.bank_name) {
    throw new ApiError(403, 'Access denied. You cannot delete policies uploaded by another bank');
  }

  // Delete from Cloudinary
  try {
    await deleteFromCloudinary(policy.public_id);
  } catch (err) {
    logger.error(`Failed to delete asset ${policy.public_id} from Cloudinary during cleanup:`, err);
  }

  // Delete from DB (soft delete)
  await deletePolicyFromDb(id);

  // Record audit log
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

/**
 * PUT /api/v1/bank-policies/:id
 * Updates an existing bank policy document (metadata, text content, or files).
 */
export const updatePolicy = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { title, description } = req.body;
  const file = req.file;

  const policy = await findPolicyById(id);
  if (!policy) {
    throw new ApiError(404, 'Policy document not found');
  }

  // Access check for custom uploads
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
    // Validate file type (PDF only)
    const allowedMimeTypes = ['application/pdf'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new ApiError(400, 'Only PDF format is allowed for policy documents');
    }

    // Destroy old asset on Cloudinary (unless it is one of the initial seeded defaults)
    if (policy.public_id && !policy.public_id.startsWith('capitalscale_bank_policies/default_policy_')) {
      try {
        await deleteFromCloudinary(policy.public_id);
      } catch (err) {
        logger.error(`Failed to delete old asset ${policy.public_id} from Cloudinary:`, err);
      }
    }

    // Upload new asset
    const uploadResult = await uploadToCloudinary(file.buffer, file.originalname, file.mimetype);
    updates.filename = file.originalname;
    updates.url = uploadResult.secure_url;
    updates.public_id = uploadResult.public_id;
    updates.size = file.size;
    updates.mimetype = file.mimetype;

    // Clear text content as this policy is now PDF-file-backed
    updates.content = null;
  }

  const updatedPolicy = await updatePolicyInDb(id, updates);

  // Record audit log
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
