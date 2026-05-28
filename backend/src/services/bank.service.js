import { BankAccount, OTP } from '../models/index.js';
import ApiError from '../utils/ApiError.js';
import logger from '../utils/logger.js';

const BankService = {
  /**
   * Get all linked bank accounts for an SME user.
   */
  async getLinkedAccounts(smeId) {
    logger.info(`Fetching linked bank accounts for SME user ${smeId}`);
    return await BankAccount.find({ sme_id: smeId, is_linked: true }).sort({ created_at: -1 });
  },

  /**
   * Generate and store OTP. Logs the code in development.
   */
  async sendOtp(smeId, contact) {
    logger.info(`Requesting OTP code for SME ${smeId} to contact: ${contact}`);

    if (!contact) {
      throw ApiError.badRequest('Contact detail (email or phone) is required');
    }

    // Generate a secure 6-digit numeric OTP code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes TTL expiration

    // Delete any existing OTP for this user and contact to prevent duplicates
    await OTP.deleteMany({ sme_id: smeId, contact });

    // Store in database
    await OTP.create({
      sme_id: smeId,
      contact,
      code,
      expires_at: expiresAt,
      attempts: 0,
    });

    // Logging OTP code (fulfills backend logging requirement)
    logger.info(`[OTP LOG] Generated verification code for contact ${contact}: ${code}`);

    // Return the code in response ONLY for local testing/preview ease
    return {
      message: 'OTP verification code generated successfully',
      contact,
      expires_in_seconds: 120,
      code_preview: code, // Preview allowed for local testing
    };
  },

  /**
   * Verify OTP and link the bank account.
   */
  async verifyOtpAndLink(smeId, data) {
    const { bank_name, account_number, account_type, linked_contact, ifsc_code, code } = data;

    if (!bank_name || !account_number || !account_type || !linked_contact || !ifsc_code || !code) {
      throw ApiError.badRequest('Missing details required to verify OTP and link bank account');
    }

    logger.info(`Verifying OTP for contact ${linked_contact} to link with bank ${bank_name}`);

    // Find the OTP document
    const otp = await OTP.findOne({ sme_id: smeId, contact: linked_contact });
    if (!otp) {
      throw ApiError.notFound('No verification request found. Please request a new OTP.');
    }

    // 1. Check expiration
    if (new Date() > otp.expires_at) {
      await otp.deleteOne();
      throw ApiError.badRequest('Verification code has expired. Please request a new OTP.');
    }

    // 2. Check and increment attempts
    if (otp.attempts >= 3) {
      await otp.deleteOne();
      throw ApiError.badRequest('Too many failed attempts. Please request a new OTP.');
    }

    otp.attempts += 1;
    await otp.save();

    // 3. Verify OTP code match
    if (otp.code !== code) {
      throw ApiError.badRequest(`Invalid verification code. ${3 - otp.attempts} attempts remaining.`);
    }

    // 4. Verification successful, check if bank account is already linked
    const existing = await BankAccount.findOne({
      sme_id: smeId,
      bank_name,
      account_number,
      is_linked: true,
    });

    if (existing) {
      await otp.deleteOne();
      throw ApiError.conflict('This bank account is already linked to your profile.');
    }

    // Link account
    const bankAccount = await BankAccount.create({
      sme_id: smeId,
      bank_name,
      account_number,
      account_type,
      linked_contact,
      ifsc_code,
      is_linked: true,
    });

    // Delete used OTP
    await otp.deleteOne();

    logger.info(`Successfully linked bank account ${account_number} (${bank_name}) for SME ${smeId}`);
    return bankAccount;
  },

  /**
   * Unlink a bank account.
   */
  async unlinkAccount(smeId, accountId) {
    logger.info(`Requesting to unlink account ${accountId} for SME user ${smeId}`);

    const account = await BankAccount.findOne({ _id: accountId, sme_id: smeId });
    if (!account) {
      throw ApiError.notFound('Linked bank account not found');
    }

    account.is_linked = false;
    await account.save();

    logger.info(`Successfully unlinked bank account ${accountId}`);
    return account;
  },
};

export default BankService;
