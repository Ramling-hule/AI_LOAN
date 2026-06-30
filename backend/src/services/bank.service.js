import {
  findLinkedAccountsBySmeId,
  findAccountByNumberAndSmeId,
  createBankAccount,
  unlinkBankAccount,
  findBankAccountByIdAndSmeId,
} from '../db/queries/bankAccounts.queries.js';
import {
  createOtp,
  deleteOtpsByUserContact,
  findOtp,
  incrementOtpAttempts,
  deleteOtp,
} from '../db/queries/otps.queries.js';
import ApiError from '../utils/ApiError.js';
import logger from '../utils/logger.js';

const BankService = {
  
  async getLinkedAccounts(smeId) {
    logger.info(`Fetching linked bank accounts for SME user ${smeId}`);
    return await findLinkedAccountsBySmeId(smeId);
  },

  
  async sendOtp(smeId, contact) {
    logger.info(`Requesting OTP code for SME ${smeId} to contact: ${contact}`);

    if (!contact) {
      throw ApiError.badRequest('Contact detail (email or phone) is required');
    }

    
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    
    await deleteOtpsByUserContact(smeId, contact);

    
    await createOtp({
      user_id: smeId,
      contact,
      code,
      expiresInMs: 2 * 60 * 1000,
    });

    
    logger.info(`[OTP LOG] Generated verification code for contact ${contact}: ${code}`);

    
    return {
      message: 'OTP verification code generated successfully',
      contact,
      expires_in_seconds: 120,
      code_preview: code, 
    };
  },

  
  async verifyOtpAndLink(smeId, data) {
    const { bank_name, account_number, account_type, linked_contact, ifsc_code, code } = data;

    if (!bank_name || !account_number || !account_type || !linked_contact || !ifsc_code || !code) {
      throw ApiError.badRequest('Missing details required to verify OTP and link bank account');
    }

    logger.info(`Verifying OTP for contact ${linked_contact} to link with bank ${bank_name}`);

    
    const otp = await findOtp({ user_id: smeId, contact: linked_contact });
    if (!otp) {
      throw ApiError.notFound('No verification request found. Please request a new OTP.');
    }

    
    if (new Date() > new Date(otp.expires_at)) {
      await deleteOtp(otp.id);
      throw ApiError.badRequest('Verification code has expired. Please request a new OTP.');
    }

    
    if (otp.attempts >= 3) {
      await deleteOtp(otp.id);
      throw ApiError.badRequest('Too many failed attempts. Please request a new OTP.');
    }

    
    await incrementOtpAttempts(otp.id);

    
    if (otp.code !== code) {
      throw ApiError.badRequest(`Invalid verification code. ${3 - (otp.attempts + 1)} attempts remaining.`);
    }

    
    const existing = await findAccountByNumberAndSmeId(smeId, bank_name, account_number);

    if (existing) {
      await deleteOtp(otp.id);
      throw ApiError.conflict('This bank account is already linked to your profile.');
    }

    
    const bankAccount = await createBankAccount({
      sme_id: smeId,
      bank_name,
      account_number,
      account_type,
      linked_contact,
      ifsc_code,
    });

    
    await deleteOtp(otp.id);

    logger.info(`Successfully linked bank account ${account_number} (${bank_name}) for SME ${smeId}`);
    return bankAccount;
  },

  
  async unlinkAccount(smeId, accountId) {
    logger.info(`Requesting to unlink account ${accountId} for SME user ${smeId}`);

    const account = await findBankAccountByIdAndSmeId(accountId, smeId);
    if (!account) {
      throw ApiError.notFound('Linked bank account not found');
    }

    await unlinkBankAccount(accountId, smeId);

    logger.info(`Successfully unlinked bank account ${accountId}`);
    return { ...account, is_linked: false };
  },
};

export default BankService;
