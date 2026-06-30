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







export const getPartnerBanks = asyncHandler(async (req, res) => {
  const banks = await LoanService.getPartnerBanks();
  return ApiResponse.ok(banks, 'Partner banks fetched successfully').send(res);
});


export const getLoans = asyncHandler(async (req, res) => {
  const loans = await LoanService.getLoans(req.user, req.query);
  return ApiResponse.ok(loans, 'Loans retrieved successfully').send(res);
});


export const createLoan = asyncHandler(async (req, res) => {
  const loan = await LoanService.createLoan(req.user.id, req.body);

  
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


export const getLoanById = asyncHandler(async (req, res) => {
  const loan = await LoanService.getLoanById(req.params.id, req.user);
  return ApiResponse.ok(loan, 'Loan application fetched successfully').send(res);
});


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


export const updateLoan = asyncHandler(async (req, res) => {
  const loan = await LoanService.updateLoan(req.params.id, req.body, req.user);

  
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


export const deleteLoan = asyncHandler(async (req, res) => {
  await LoanService.deleteLoan(req.params.id, req.user);

  
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


export const uploadDocument = asyncHandler(async (req, res) => {
  
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


export const changeLoanStatus = asyncHandler(async (req, res) => {
  const { toStatus, notes, missingDocs } = req.body;
  const loan = await LoanService.transitionLoanStatus(
    req.params.id,
    toStatus,
    req.user,
    notes,
    missingDocs
  );

  
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


export const getLoanHistory = asyncHandler(async (req, res) => {
  const history = await LoanService.getStatusHistory(req.params.id, req.user);
  return ApiResponse.ok(history, 'Loan history logs retrieved successfully').send(res);
});
