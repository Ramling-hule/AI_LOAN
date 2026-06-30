import supabase from '../supabaseClient.js';
import { v4 as uuidv4 } from 'uuid';






export const recordAuditLog = async ({
  actor_id = 'system',
  actor_ref_model = 'System',
  actor_email,
  action,
  method,
  resource_path,
  resource_id,
  resource_model,
  previous_state,
  new_state,
  status = 'success',
  status_code,
  error_message,
  ip_address,
  user_agent,
  correlation_id,
  metadata,
}) => {
  try {
    const { data, error } = await supabase
      .from('audit_logs')
      .insert({
        id: uuidv4(),
        actor_id, actor_ref_model, actor_email: actor_email || null, action,
        method: method || null, resource_path: resource_path || null, 
        resource_id: resource_id || null, resource_model: resource_model || null,
        previous_state: previous_state || null,
        new_state: new_state || null,
        status, status_code: status_code || null, error_message: error_message || null,
        ip_address: ip_address || null, user_agent: user_agent || null, 
        correlation_id: correlation_id || null,
        metadata: metadata || null,
      })
      .select('id')
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    
    console.error('[AuditLog] Failed to record audit log:', err.message);
    return null;
  }
};

export const findAuditLogs = async ({ actor_id, resource_id, action, limit = 50, page = 1 }) => {
  let query = supabase.from('audit_logs').select('*');

  if (actor_id) query = query.eq('actor_id', actor_id);
  if (resource_id) query = query.eq('resource_id', resource_id);
  if (action) query = query.ilike('action', `%${action}%`);

  const offset = (page - 1) * limit;
  query = query.order('created_at', { ascending: false })
               .range(offset, offset + limit - 1);

  const { data, error } = await query;
  
  if (error) {
    console.error('[AuditLog] Fetch error:', error.message);
    return [];
  }
  return data;
};
