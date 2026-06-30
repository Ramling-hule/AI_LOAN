import supabase from '../supabaseClient.js';
import { v4 as uuidv4 } from 'uuid';






export const createOtp = async ({ user_id, contact, code, expiresInMs = 5 * 60 * 1000 }) => {
  const expires_at = new Date(Date.now() + expiresInMs).toISOString();
  
  const { data, error } = await supabase
    .from('otp_codes')
    .insert({
      id: uuidv4(),
      user_id,
      contact,
      code,
      expires_at
    })
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const deleteOtpsByUserContact = async (user_id, contact) => {
  const { error } = await supabase
    .from('otp_codes')
    .delete()
    .eq('user_id', user_id)
    .eq('contact', contact);

  if (error) throw error;
};

export const findOtp = async ({ user_id, contact }) => {
  const { data, error } = await supabase
    .from('otp_codes')
    .select('*')
    .eq('user_id', user_id)
    .eq('contact', contact)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
};

export const incrementOtpAttempts = async (id) => {
  
  
  const { data: otp } = await supabase
    .from('otp_codes')
    .select('attempts')
    .eq('id', id)
    .single();

  if (otp) {
    const { error } = await supabase
      .from('otp_codes')
      .update({ attempts: (otp.attempts || 0) + 1 })
      .eq('id', id);

    if (error) throw error;
  }
};

export const deleteOtp = async (id) => {
  const { error } = await supabase
    .from('otp_codes')
    .delete()
    .eq('id', id);

  if (error) throw error;
};
