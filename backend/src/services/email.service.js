import logger from '../utils/logger.js';

export const EmailService = {
  
  async sendEmail({ to, subject, html }) {
    logger.info(`[Email Service] SIMULATED EMAIL SENT to: ${to}`);
    logger.info(`[Email Service] Subject: ${subject}`);
    logger.info(`[Email Service] Content Snippet: ${html.replace(/<[^>]*>/g, '').slice(0, 200)}...`);
    return { success: true, messageId: `sim_${Date.now()}` };
  },

  
  async sendMissingInfoRequest(smeUser, loan, missingFieldsList) {
    const subject = `ACTION REQUIRED: Missing Information for Loan Application ${loan.appId}`;
    const fieldsHtml = missingFieldsList.map(f => `<li>${f}</li>`).join('');
    const html = `
      <h3>Dear ${smeUser.full_name},</h3>
      <p>The underwriting team at CapitalScale requires additional clarification or document replacement for your loan application <strong>${loan.appId}</strong> (Lender: ${loan.bank_name}).</p>
      <p>Please log in to your SME Dashboard to upload/verify the following outstanding parameters:</p>
      <ul>
        ${fieldsHtml}
      </ul>
      <p>Best regards,<br/>CapitalScale Team</p>
    `;
    return this.sendEmail({ to: smeUser.email, subject, html });
  },

  
  async sendMissingInfoCompleted(bankAdmin, loan) {
    const subject = `NOTIFICATION: Missing Info Submitted for Loan ${loan.appId}`;
    const html = `
      <h3>Dear Underwriting Team,</h3>
      <p>The applicant for loan <strong>${loan.appId}</strong> has uploaded all requested missing documents.</p>
      <p>The AI extraction pipeline has rerun, and the updated parameters are available in your evaluation queue.</p>
      <p>Best regards,<br/>CapitalScale Underwriter Center</p>
    `;
    return this.sendEmail({ to: bankAdmin.email, subject, html });
  }
};

export default EmailService;
