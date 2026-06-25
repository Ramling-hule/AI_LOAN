import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import LoanService from '../services/loan.service.js';
import { recordAuditLog } from '../db/queries/auditLogs.queries.js';
import { findLoanById } from '../db/queries/loans.queries.js';
import axios from 'axios';
import logger from '../utils/logger.js';

const aiClient = axios.create({
  baseURL: process.env.AI_SERVICE_URL || 'http://127.0.0.1:5001',
  timeout: 30000,
});

// ---------------------------------------------------------------------------
// Loan Controller
// Coordinates route parsing, service delegation, auditing, and Jsend output.
// ---------------------------------------------------------------------------

/**
 * GET /api/v1/loans/partner-banks
 * Returns the list of registered commercial partner banks.
 */
export const getPartnerBanks = asyncHandler(async (req, res) => {
  const banks = await LoanService.getPartnerBanks();
  return ApiResponse.ok(banks, 'Partner banks fetched successfully').send(res);
});

/**
 * GET /api/v1/loans
 * Returns a list of applications filtered by the user's role constraints.
 */
export const getLoans = asyncHandler(async (req, res) => {
  const loans = await LoanService.getLoans(req.user, req.query);
  return ApiResponse.ok(loans, 'Loans retrieved successfully').send(res);
});

/**
 * POST /api/v1/loans
 * Submits a new loan application.
 */
export const createLoan = asyncHandler(async (req, res) => {
  const loan = await LoanService.createLoan(req.user.id, req.body);

  // Record audit log
  recordAuditLog({
    actor_id: req.user.id,
    actor_ref_model: 'SMEUser',
    actor_email: req.user.email,
    action: 'loan.create',
    method: 'POST',
    resource_path: req.originalUrl,
    resource_id: loan.id,
    resource_model: 'Loan',
    status: 'success',
    status_code: 201,
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
  }).catch(() => {});

  return ApiResponse.created(loan, 'Loan application submitted successfully').send(res);
});

/**
 * GET /api/v1/loans/:id
 * Fetches a single application by ID with RBAC guards.
 */
export const getLoanById = asyncHandler(async (req, res) => {
  const loan = await LoanService.getLoanById(req.params.id, req.user);
  return ApiResponse.ok(loan, 'Loan application fetched successfully').send(res);
});

/**
 * POST /api/v1/loans/draft/:id/chat
 * Proxy chat requests to AI Services
 */
export const chatWithLoan = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { query } = req.body;
  if (!query) throw ApiError.badRequest('Query is required');

  const loan = await findLoanById(id);
  if (!loan) throw ApiError.notFound('Loan not found');

  try {
    const response = await aiClient.post(`/api/v1/chat/loan/${loan.app_id}`, { query });
    return res.json(response.data);
  } catch (error) {
    logger.error(`[Chat] Proxy error: ${error.message}`);
    if (error.response) {
      if (error.response.status === 429) {
        return res.status(429).json({
          success: false,
          message: error.response.data?.detail?.message || 'AI Engine rate limited',
          retry_after: error.response.data?.detail?.retry_after || 30
        });
      }
      
      const detailStr = error.response.data?.detail;
      if (typeof detailStr === 'string' && (detailStr.includes('429') || detailStr.includes('quota'))) {
        const match = detailStr.match(/retry in (\d+\.?\d*)s/);
        const retryAfter = match ? Math.ceil(parseFloat(match[1])) : 60;
        return res.status(429).json({
          success: false,
          message: 'AI Engine Free Tier Quota exceeded',
          retry_after: retryAfter
        });
      }

      logger.error(`[Chat] AI Service response: ${JSON.stringify(error.response.data)}`);
      throw ApiError.internal(`AI chat service error: ${JSON.stringify(error.response.data)}`);
    }
    throw ApiError.internal('Failed to communicate with AI chat service');
  }
});

/**
 * PATCH /api/v1/loans/:id
 * Updates loan application status or progress (underwriter/bank admin).
 */
export const updateLoan = asyncHandler(async (req, res) => {
  const loan = await LoanService.updateLoan(req.params.id, req.body, req.user);

  // Record audit log
  recordAuditLog({
    actor_id: req.user.id,
    actor_ref_model: req.user.role === 'sme' ? 'SMEUser' : 'BankAdminUser',
    actor_email: req.user.email,
    action: 'loan.update',
    method: 'PATCH',
    resource_path: req.originalUrl,
    resource_id: loan.id,
    resource_model: 'Loan',
    status: 'success',
    status_code: 200,
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
  }).catch(() => {});

  return ApiResponse.ok(loan, 'Loan application updated successfully').send(res);
});

/**
 * DELETE /api/v1/loans/:id
 * Hard deletes a loan record (restricted to super admins).
 */
export const deleteLoan = asyncHandler(async (req, res) => {
  await LoanService.deleteLoan(req.params.id, req.user);

  // Record audit log
  recordAuditLog({
    actor_id: req.user.id,
    actor_ref_model: req.user.role === 'sme' ? 'SMEUser' : 'BankAdminUser',
    actor_email: req.user.email,
    action: 'loan.delete',
    method: 'DELETE',
    resource_path: req.originalUrl,
    resource_id: req.params.id,
    resource_model: 'Loan',
    status: 'success',
    status_code: 200,
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
  }).catch(() => {});

  return ApiResponse.ok(null, 'Loan application deleted successfully').send(res);
});

/**
 * POST /api/v1/loans/draft
 * Initializes a new loan application draft.
 */
export const createDraft = asyncHandler(async (req, res) => {
  const loan = await LoanService.createDraft(req.user.id, req.body);

  recordAuditLog({
    actor_id: req.user.id,
    actor_ref_model: 'SMEUser',
    actor_email: req.user.email,
    action: 'loan.create_draft',
    method: 'POST',
    resource_path: req.originalUrl,
    resource_id: loan.id,
    resource_model: 'Loan',
    status: 'success',
    status_code: 201,
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
  }).catch(() => {});

  return ApiResponse.created(loan, 'Loan draft initialized successfully').send(res);
});

/**
 * PUT /api/v1/loans/draft/:id
 * Saves draft details for a specific step.
 */
export const saveDraft = asyncHandler(async (req, res) => {
  const loan = await LoanService.saveDraft(req.user.id, req.params.id, req.body);

  recordAuditLog({
    actor_id: req.user.id,
    actor_ref_model: 'SMEUser',
    actor_email: req.user.email,
    action: 'loan.save_draft',
    method: 'PUT',
    resource_path: req.originalUrl,
    resource_id: loan.id,
    resource_model: 'Loan',
    status: 'success',
    status_code: 200,
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
  }).catch(() => {});

  return ApiResponse.ok(loan, 'Loan draft updated successfully').send(res);
});

/**
 * POST /api/v1/loans/draft/:id/upload
 * Uploads a document to Cloudinary and saves it.
 */
export const uploadDocument = asyncHandler(async (req, res) => {
  // documentType is sent as field in multipart form data
  const { documentType } = req.body;
  const document = await LoanService.uploadDocument(
    req.user.id,
    req.params.id,
    documentType,
    req.file
  );

  recordAuditLog({
    actor_id: req.user.id,
    actor_ref_model: 'SMEUser',
    actor_email: req.user.email,
    action: 'loan.upload_document',
    method: 'POST',
    resource_path: req.originalUrl,
    resource_id: req.params.id,
    resource_model: 'Loan',
    status: 'success',
    status_code: 200,
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
  }).catch(() => {});

  return ApiResponse.ok(document, 'Document uploaded successfully').send(res);
});

/**
 * DELETE /api/v1/loans/draft/:id/upload/:docType
 * Deletes an uploaded document from Cloudinary and clears it in the database.
 */
export const deleteDocument = asyncHandler(async (req, res) => {
  const result = await LoanService.deleteDocument(
    req.user.id,
    req.params.id,
    req.params.docType
  );

  recordAuditLog({
    actor_id: req.user.id,
    actor_ref_model: 'SMEUser',
    actor_email: req.user.email,
    action: 'loan.delete_document',
    method: 'DELETE',
    resource_path: req.originalUrl,
    resource_id: req.params.id,
    resource_model: 'Loan',
    status: 'success',
    status_code: 200,
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
  }).catch(() => {});

  return ApiResponse.ok(result, 'Document deleted successfully').send(res);
});

/**
 * POST /api/v1/loans/draft/:id/submit
 * Validates and finalizes submission of a loan draft.
 */
export const submitLoan = asyncHandler(async (req, res) => {
  const loan = await LoanService.submitLoanApplication(req.user.id, req.params.id);

  recordAuditLog({
    actor_id: req.user.id,
    actor_ref_model: 'SMEUser',
    actor_email: req.user.email,
    action: 'loan.submit',
    method: 'POST',
    resource_path: req.originalUrl,
    resource_id: loan.id,
    resource_model: 'Loan',
    status: 'success',
    status_code: 200,
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
  }).catch(() => {});

  return ApiResponse.ok(loan, 'Loan application submitted successfully').send(res);
});

/**
 * POST /api/v1/loans/:id/status
 * Transitions a loan status.
 */
export const changeLoanStatus = asyncHandler(async (req, res) => {
  const { toStatus, notes, missingDocs } = req.body;
  const loan = await LoanService.transitionLoanStatus(
    req.params.id,
    toStatus,
    req.user,
    notes,
    missingDocs
  );

  // Record audit log
  recordAuditLog({
    actor_id: req.user.id,
    actor_ref_model: req.user.role === 'sme' ? 'SMEUser' : 'BankAdminUser',
    actor_email: req.user.email,
    action: 'loan.transition_status',
    method: 'POST',
    resource_path: req.originalUrl,
    resource_id: loan.id,
    resource_model: 'Loan',
    status: 'success',
    status_code: 200,
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
  }).catch(() => {});

  return ApiResponse.ok(loan, `Status transitioned to ${toStatus} successfully`).send(res);
});

/**
 * GET /api/v1/loans/:id/history
 * Fetches status transition audit history logs for a loan.
 */
export const getLoanHistory = asyncHandler(async (req, res) => {
  const history = await LoanService.getStatusHistory(req.params.id, req.user);
  return ApiResponse.ok(history, 'Loan history logs retrieved successfully').send(res);
});
