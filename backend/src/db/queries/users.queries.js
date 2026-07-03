import supabase from '../supabaseClient.js';
import { v4 as uuidv4 } from 'uuid';








export const findSMEByEmail = async (email, includePassword = false) => {
  const fields = includePassword
    ? '*'
    : 'id, full_name, business_name, phone, email, role_id, address, is_verified, is_active, email_verified_at, last_login_at, is_deleted, deleted_at, created_at, updated_at';

  const { data, error } = await supabase
    .from('sme_users')
    .select(fields)
    .eq('email', email.toLowerCase())
    .eq('is_deleted', false)
    .maybeSingle();

  if (error) throw error;
  return data;
};

export const findSMEById = async (id, includePassword = false) => {
  const fields = includePassword 
    ? '*' 
    : 'id, full_name, business_name, phone, email, role_id, address, is_verified, is_active, last_login_at, is_deleted, created_at, updated_at';
  
  const { data, error } = await supabase
    .from('sme_users')
    .select(fields)
    .eq('id', id)
    .eq('is_deleted', false)
    .maybeSingle();

  if (error) throw error;
  return data;
};

export const createSMEUser = async ({ full_name, business_name, phone, email, password_hash, role_id, address = {} }) => {
  const { data, error } = await supabase
    .from('sme_users')
    .insert({
      id: uuidv4(), full_name, business_name, phone, email: email.toLowerCase(), 
      password_hash, role_id, address
    })
    .select('id, full_name, business_name, phone, email, role_id, address, is_active, is_verified, created_at')
    .single();

  if (error) throw error;
  return data;
};

export const updateSMELastLogin = async (id) => {
  const { error } = await supabase
    .from('sme_users')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
};

export const searchSMEUsers = async (searchTerm) => {
  const { data, error } = await supabase
    .from('sme_users')
    .select('id, full_name, business_name, email')
    .eq('is_deleted', false)
    .or(`full_name.ilike.%${searchTerm}%,business_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`)
    .limit(50);

  if (error) throw error;
  return data || [];
};



export const findBankAdminByEmail = async (email, includePassword = false) => {
  const fields = includePassword 
    ? '*' 
    : 'id, bank_name, branch_name, branch_address, ifsc_code, admin_name, email, phone, role_id, is_active, last_login_at, is_deleted, created_at, updated_at';
  
  const { data, error } = await supabase
    .from('bank_admin_users')
    .select(fields)
    .eq('email', email.toLowerCase())
    .eq('is_deleted', false)
    .maybeSingle();

  if (error) throw error;
  return data;
};

export const findBankAdminById = async (id, includePassword = false) => {
  const fields = includePassword 
    ? '*' 
    : 'id, bank_name, branch_name, branch_address, ifsc_code, admin_name, email, phone, role_id, is_active, last_login_at, is_deleted, created_at, updated_at';
  
  const { data, error } = await supabase
    .from('bank_admin_users')
    .select(fields)
    .eq('id', id)
    .eq('is_deleted', false)
    .maybeSingle();

  if (error) throw error;
  return data;
};

export const findBankAdminsByBankName = async (bankName) => {
  const { data, error } = await supabase
    .from('bank_admin_users')
    .select('id, bank_name, admin_name, email')
    .eq('bank_name', bankName)
    .eq('is_deleted', false)
    .eq('is_active', true);

  if (error) throw error;
  return data || [];
};

export const createBankAdminUser = async ({ bank_name, branch_name, branch_address = {}, ifsc_code, admin_name, email, phone, password_hash, role_id }) => {
  const { data, error } = await supabase
    .from('bank_admin_users')
    .insert({
      id: uuidv4(), bank_name, branch_name, branch_address, ifsc_code, 
      admin_name, email: email.toLowerCase(), phone, password_hash, role_id
    })
    .select('id, bank_name, branch_name, admin_name, email, phone, role_id, is_active, created_at')
    .single();

  if (error) throw error;
  return data;
};

export const updateBankAdminLastLogin = async (id) => {
  const { error } = await supabase
    .from('bank_admin_users')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', id);
    
  if (error) throw error;
};



export const findRoleByName = async (name) => {
  const { data, error } = await supabase
    .from('roles')
    .select('id, name, description')
    .eq('name', name)
    .eq('is_deleted', false)
    .maybeSingle();

  if (error) throw error;
  return data;
};

export const getRolePermissions = async (roleId) => {
  const { data, error } = await supabase
    .from('role_permissions')
    .select(`
      permissions!inner (
        name
      )
    `)
    .eq('role_id', roleId);

  if (error) throw error;
  return data.map(r => r.permissions.name);
};

/**
 * Returns one representative record per distinct bank_name from
 * bank_admin_users (picking the earliest registered admin to anchor
 * branch/ifsc metadata).  Only active, non-deleted admins are included.
 */
export const getRegisteredBanks = async () => {
  const { data, error } = await supabase
    .from('bank_admin_users')
    .select('id, bank_name, branch_name, ifsc_code')
    .eq('is_deleted', false)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error) throw error;

  // De-duplicate: keep first occurrence of each bank_name
  const seen = new Set();
  return (data || []).filter(row => {
    if (seen.has(row.bank_name)) return false;
    seen.add(row.bank_name);
    return true;
  });
};
