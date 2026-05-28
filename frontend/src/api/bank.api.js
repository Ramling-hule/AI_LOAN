// ---------------------------------------------------------------------------
// Bank API — endpoint wrappers for banking routes
// ---------------------------------------------------------------------------

import apiClient from './apiClient';

export const bankApi = {
  /**
   * Get all linked bank accounts.
   */
  getLinkedAccounts: () => apiClient.get('/banks/accounts'),

  /**
   * Request OTP code generation.
   * @param {string} contact - Email or phone
   */
  sendOtp: (contact) => apiClient.post('/banks/otp/send', { contact }),

  /**
   * Verify OTP and link bank account.
   * @param {object} data - { bank_name, account_number, account_type, linked_contact, ifsc_code, code }
   */
  verifyOtpAndLink: (data) => apiClient.post('/banks/otp/verify', data),

  /**
   * Unlink a bank account.
   * @param {string} id - Bank account ID
   */
  unlinkAccount: (id) => apiClient.delete(`/banks/accounts/${id}`),

  /**
   * Get all confidential bank policies.
   */
  getPolicies: () => apiClient.get('/bank-policies'),

  /**
   * Upload a new confidential bank policy.
   * @param {string} title
   * @param {string} description
   * @param {File} file
   */
  uploadPolicy: (title, description, file) => {
    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', description || '');
    formData.append('file', file);
    return apiClient.post('/bank-policies', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  /**
   * Delete a custom bank policy.
   * @param {string} id
   */
  deletePolicy: (id) => apiClient.delete(`/bank-policies/${id}`),

  /**
   * Update an existing bank policy.
   * @param {string} id
   * @param {string} title
   * @param {string} description
   * @param {File} file
   * @param {string} content
   */
  updatePolicy: (id, title, description, file, content) => {
    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', description || '');
    if (file) {
      formData.append('file', file);
    }
    if (content !== undefined) {
      formData.append('content', content);
    }
    return apiClient.put(`/bank-policies/${id}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

export default bankApi;
