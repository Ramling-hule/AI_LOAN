import supabase from '../supabaseClient.js';
import { v4 as uuidv4 } from 'uuid';








export const createLoan = async ({ sme_id, bank_name }) => {
  const appId = `APP-${Math.floor(1000 + Math.random() * 9000)}`;
  
  const { data, error } = await supabase
    .from('loans')
    .insert({
      id: uuidv4(),
      app_id: appId,
      sme_id,
      bank_name,
      status: 'draft',
      progress: 10,
      current_step: 1
    })
    .select()
    .single();

  if (error) throw error;
  if (!data) return null;

  
  data._id = data.id;
  data.appId = data.app_id;
  return data;
};



export const findLoanById = async (id) => {
  const { data, error } = await supabase
    .from('loans')
    .select('*, sme_users(*)')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return _shapeLoan(data);
};

export const findLoanByAppId = async (appId) => {
  const { data, error } = await supabase
    .from('loans')
    .select('*')
    .eq('app_id', appId)
    .maybeSingle();

  if (error) throw error;
  return data;
};

export const findLoans = async ({ sme_id, bank_name, status, search, page = 1, limit = 10 }) => {
  
  let query = supabase
    .from('loans')
    .select('*, sme_users(*)', { count: 'exact' });

  if (sme_id) query = query.eq('sme_id', sme_id);
  if (bank_name) query = query.eq('bank_name', bank_name);
  if (status && status !== 'all') query = query.eq('status', status);

  if (search) {
    
    
    
    
    
    query = supabase.from('loans').select('*, sme_users!inner(*)', { count: 'exact' });
    if (sme_id) query = query.eq('sme_id', sme_id);
    if (bank_name) query = query.eq('bank_name', bank_name);
    if (status && status !== 'all') query = query.eq('status', status);
    
    query = query.or(`business_name.ilike.%${search}%,full_name.ilike.%${search}%,email.ilike.%${search}%`, { foreignTable: 'sme_users' });
  }

  const offset = (page - 1) * limit;
  query = query.order('created_at', { ascending: false })
               .range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  if (error) throw error;

  return {
    docs: (data || []).map(_shapeLoan),
    totalDocs: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
  };
};



export const updateLoanDraft = async (id, payload) => {
  
  const { data: existing } = await supabase.from('loans').select('business_info, financial_info, behavioural_questions').eq('id', id).single();
  if (!existing) return null;

  const updates = {};
  const simple = ['amount', 'tenure', 'purpose', 'revenue', 'current_step', 'progress', 'status', 'risk_score'];
  for (const field of simple) {
    if (payload[field] !== undefined) updates[field] = payload[field];
  }

  const jsonb = ['business_info', 'financial_info', 'behavioural_questions'];
  for (const field of jsonb) {
    if (payload[field] !== undefined) {
      
      updates[field] = { ...(existing[field] || {}), ...payload[field] };
    }
  }

  if (Object.keys(updates).length === 0) return findLoanById(id);

  const { data, error } = await supabase
    .from('loans')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  if (!data) return null;
  
  data._id = data.id;
  data.appId = data.app_id;
  return data;
};

export const setLoanDocument = async (loanId, documentType, docData) => {
  const { data: loan } = await supabase.from('loans').select('documents').eq('id', loanId).single();
  if (!loan) return null;

  const currentDocs = loan.documents || {};
  currentDocs[documentType] = docData;

  const { data, error } = await supabase
    .from('loans')
    .update({ documents: currentDocs })
    .eq('id', loanId)
    .select('documents')
    .single();

  if (error) throw error;
  return data?.documents?.[documentType] || null;
};

export const removeDocument = async (loanId, documentType) => {
  const { data: loan } = await supabase.from('loans').select('documents').eq('id', loanId).single();
  if (!loan) return null;

  const currentDocs = loan.documents || {};
  delete currentDocs[documentType];

  const { data, error } = await supabase
    .from('loans')
    .update({ documents: currentDocs })
    .eq('id', loanId)
    .select('documents')
    .single();

  if (error) throw error;
  return data?.documents;
};

export const updateLoanExtractionStatus = async (loanId, { extraction_id, is_complete, overall_confidence, missing_fields, extraction_model, parameters }) => {
  const status = is_complete ? 'completed' : 'partial';
  const summary = {
    gstin: parameters?.gstin || null,
    pan: parameters?.pan || null,
    annual_turnover: parameters?.annual_turnover || null,
    net_profit: parameters?.net_profit || null,
    overall_confidence: overall_confidence || null,
    missing_fields: missing_fields || [],
  };

  const { data, error } = await supabase
    .from('loans')
    .update({
      ai_extraction_id: extraction_id,
      ai_extraction_status: status,
      ai_extracted_at: new Date().toISOString(),
      extracted_summary: summary
    })
    .eq('id', loanId)
    .select('id, ai_extraction_status, extracted_summary')
    .single();

  if (error) throw error;
  return data;
};

export const updateLoanUnderwritingAssessment = async (loanId, assessment, riskScore) => {
  const { data, error } = await supabase
    .from('loans')
    .update({
      underwriting_assessment: { ...assessment, assessed_at: new Date().toISOString() },
      risk_score: riskScore
    })
    .eq('id', loanId)
    .select()
    .single();

  if (error) throw error;
  
  data._id = data.id;
  data.appId = data.app_id;
  return data;
};

export const deleteLoan = async (id) => {
  const { data, error } = await supabase
    .from('loans')
    .delete()
    .eq('id', id)
    .select('id')
    .single();

  if (error) throw error;
  return data;
};



export const createStatusHistory = async ({ loan_id, from_status, to_status, changed_by, changed_by_name, changed_by_model, notes, missing_docs = [] }) => {
  const { data, error } = await supabase
    .from('loan_status_history')
    .insert({
      id: uuidv4(), loan_id, from_status, to_status, changed_by, 
      changed_by_name, changed_by_model, notes: notes || '', missing_docs
    })
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const getStatusHistory = async (loanId) => {
  const { data, error } = await supabase
    .from('loan_status_history')
    .select('*')
    .eq('loan_id', loanId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
};

export const getLastMissingInfoHistory = async (loanId) => {
  const { data, error } = await supabase
    .from('loan_status_history')
    .select('*')
    .eq('loan_id', loanId)
    .eq('to_status', 'missing_info')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
};



const _shapeLoan = (row) => {
  if (!row) return null;
  const loan = { ...row };

  loan._id = row.id;
  loan.appId = row.app_id;

  
  if (row.sme_users) {
    loan.sme_id = {
      id: row.sme_users.id,
      _id: row.sme_users.id,
      full_name: row.sme_users.full_name,
      business_name: row.sme_users.business_name,
      phone: row.sme_users.phone,
      email: row.sme_users.email,
      address: row.sme_users.address,
    };
    delete loan.sme_users;
  }
  return loan;
};
