import supabase from '../supabaseClient.js';
import { v4 as uuidv4 } from 'uuid';






export const findPoliciesForBank = async (bankName) => {
  const { data, error } = await supabase
    .from('bank_policy_documents')
    .select('*')
    .eq('is_active', true)
    .or(`bank_name.eq."${bankName}",is_system_default.eq.true`)
    .order('is_system_default', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
};

/**
 * Returns the single most-recently uploaded active policy for a bank,
 * or null if the bank has no policies yet.
 */
export const getLatestPolicyForBank = async (bankName) => {
  const { data, error } = await supabase
    .from('bank_policy_documents')
    .select('id, title, filename, url, created_at, is_system_default')
    .eq('is_active', true)
    .eq('bank_name', bankName)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
};

export const findAllPolicies = async ({ bankName, page = 1, limit = 20 }) => {
  let query = supabase
    .from('bank_policy_documents')
    .select('*', { count: 'exact' })
    .eq('is_active', true);

  if (bankName) query = query.eq('bank_name', bankName);

  const offset = (page - 1) * limit;
  query = query.order('created_at', { ascending: false })
               .range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  if (error) throw error;
  
  
  
  
  return data || [];
};

export const findPolicyById = async (id) => {
  const { data, error } = await supabase
    .from('bank_policy_documents')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data;
};

export const createPolicy = async ({
  bank_name,
  title,
  content,
  description,
  filename,
  url,
  public_id,
  size,
  mimetype,
  uploaded_by,
  uploaded_by_name,
  is_system_default = false,
}) => {
  const { data, error } = await supabase
    .from('bank_policy_documents')
    .insert({
      id: uuidv4(),
      bank_name: bank_name || null,
      title,
      content: content || null,
      description: description || null,
      filename: filename || null,
      url: url || null,
      public_id: public_id || null,
      size: size || null,
      mimetype: mimetype || null,
      uploaded_by: uploaded_by || null,
      uploaded_by_name: uploaded_by_name || null,
      is_system_default,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const updatePolicy = async (
  id,
  updates
) => {
  const allowed = ['title', 'content', 'description', 'filename', 'url', 'public_id', 'size', 'mimetype', 'is_system_default', 'is_active', 'query_embedding'];
  const updatePayload = {};
  
  for (const field of allowed) {
    if (updates[field] !== undefined) {
      updatePayload[field] = updates[field];
    }
  }

  if (Object.keys(updatePayload).length === 0) return findPolicyById(id);

  const { data, error } = await supabase
    .from('bank_policy_documents')
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const deletePolicy = async (id, bankName) => {
  const { error } = await supabase
    .from('bank_policy_documents')
    .update({ is_active: false })
    .eq('id', id);

  if (error) throw error;

  if (bankName) {
    await supabase.from('policy_rules').delete().eq('bank_id', bankName);
    await supabase.from('rule_relationships').delete().eq('bank_id', bankName);
  }
};
