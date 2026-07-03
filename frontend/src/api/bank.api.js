



import apiClient from './apiClient';

export const bankApi = {
  
  getLinkedAccounts: () => apiClient.get('/banks/accounts'),

  
  sendOtp: (contact) => apiClient.post('/banks/otp/send', { contact }),

  
  verifyOtpAndLink: (data) => apiClient.post('/banks/otp/verify', data),

  
  unlinkAccount: (id) => apiClient.delete(`/banks/accounts/${id}`),

  
  getPolicies: () => apiClient.get('/bank-policies'),

  
  uploadPolicy: (title, description, file) => {
    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', description || '');
    formData.append('file', file);
    return apiClient.post('/bank-policies', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  
  deletePolicy: (id) => apiClient.delete(`/bank-policies/${id}`),
  
  extractPolicyRules: (id) => apiClient.post(`/bank-policies/${id}/extract`),

  
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

  
  chatWithPolicy: (bankName, query) => apiClient.post(`/banks/policy/${encodeURIComponent(bankName)}/chat`, { query }),

  getBankPolicies: (bankName) => apiClient.get(`/banks/policy/${encodeURIComponent(bankName)}`),
};

export default bankApi;
