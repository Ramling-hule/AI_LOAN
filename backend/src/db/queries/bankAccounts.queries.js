import supabase from '../supabaseClient.js';
import { v4 as uuidv4 } from 'uuid';






export const findLinkedAccountsBySmeId = async (smeId) => {
  const { data, error } = await supabase
    .from('bank_accounts')
    .select('*')
    .eq('sme_id', smeId)
    .eq('is_linked', true)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
};

export const findAccountByNumberAndSmeId = async (smeId, bankName, accountNumber) => {
  const { data, error } = await supabase
    .from('bank_accounts')
    .select('*')
    .eq('sme_id', smeId)
    .eq('bank_name', bankName)
    .eq('account_number', accountNumber)
    .eq('is_linked', true)
    .maybeSingle();

  if (error) throw error;
  return data;
};

export const findBankAccountByIdAndSmeId = async (id, smeId) => {
  const { data, error } = await supabase
    .from('bank_accounts')
    .select('*')
    .eq('id', id)
    .eq('sme_id', smeId)
    .maybeSingle();

  if (error) throw error;
  return data;
};

export const createBankAccount = async ({
  sme_id,
  bank_name,
  account_number,
  account_type = 'current',
  linked_contact,
  ifsc_code,
}) => {
  const { data, error } = await supabase
    .from('bank_accounts')
    .insert({
      id: uuidv4(),
      sme_id,
      bank_name,
      account_number,
      account_type,
      linked_contact,
      ifsc_code,
      is_linked: true
    })
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const unlinkBankAccount = async (id, smeId) => {
  const { data, error } = await supabase
    .from('bank_accounts')
    .update({ 
      is_linked: false, 
      updated_at: new Date().toISOString() 
    })
    .eq('id', id)
    .eq('sme_id', smeId)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
};
