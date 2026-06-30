import supabase from '../db/supabaseClient.js';
import { findBankAdminById } from '../db/queries/users.queries.js';
import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';








export const getAuditLogs = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, action, status, search } = req.query;

  let query = supabase.from('audit_logs').select('*', { count: 'exact' });

  
  if (req.user.role === 'bank_admin' || req.user.role === 'bank_underwriter') {
    
    const bankAdmin = await findBankAdminById(req.user.id);
    if (!bankAdmin) {
      throw ApiError.unauthorized('Bank administrator account not found');
    }

    
    const { data: admins } = await supabase.from('bank_admin_users').select('id').eq('bank_name', bankAdmin.bank_name);
    const { data: loans } = await supabase.from('loans').select('id').eq('bank_name', bankAdmin.bank_name);
    
    const adminIds = admins?.map(a => a.id) || [];
    const loanIds = loans?.map(l => l.id) || [];

    const adminFilter = adminIds.length > 0 ? `actor_id.in.(${adminIds.join(',')})` : 'actor_id.eq.invalid';
    const loanFilter = loanIds.length > 0 ? `resource_id.in.(${loanIds.join(',')})` : 'resource_id.eq.invalid';

    query = query.or(`${adminFilter},${loanFilter}`);

  } else if (req.user.role !== 'super_admin') {
    throw ApiError.forbidden('Role not authorized to access audit logs');
  }

  
  if (action) query = query.eq('action', action);
  if (status) query = query.eq('status', status);
  if (search) {
    query = query.or(`actor_email.ilike.%${search}%,action.ilike.%${search}%,resource_id.ilike.%${search}%`);
  }

  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 20;
  const offset = (pageNum - 1) * limitNum;

  query = query.order('created_at', { ascending: false })
               .range(offset, offset + limitNum - 1);

  const { data: logs, count, error } = await query;

  if (error) {
    console.error('[AuditLog] Fetch error:', error);
    throw ApiError.internal('Failed to fetch audit logs');
  }

  return ApiResponse.ok(
    {
      docs: logs || [],
      totalDocs: count || 0,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil((count || 0) / limitNum),
    },
    'Audit logs retrieved successfully'
  ).send(res);
});
