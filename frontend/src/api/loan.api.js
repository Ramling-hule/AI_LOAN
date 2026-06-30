



import apiClient from './apiClient';

export const loanApi = {
  getAll: (params) => apiClient.get('/loans', { params }),
  getById: (id) => apiClient.get(`/loans/${id}`),
  create: (data) => apiClient.post('/loans', data),
  update: (id, data) => apiClient.patch(`/loans/${id}`, data),
  delete: (id) => apiClient.delete(`/loans/${id}`),
  getPartnerBanks: () => apiClient.get('/loans/partner-banks'),
  
  
  createDraft: (bankName) => apiClient.post('/loans/draft', { bank_name: bankName }),
  saveDraft: (id, data) => apiClient.put(`/loans/draft/${id}`, data),
  submitLoan: (id) => apiClient.post(`/loans/draft/${id}/submit`),
  uploadDocument: (id, documentType, file, onUploadProgress) => {
    const formData = new FormData();
    formData.append('documentType', documentType);
    formData.append('file', file);
    return apiClient.post(`/loans/draft/${id}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress,
    });
  },
  deleteDocument: (id, documentType) => apiClient.delete(`/loans/draft/${id}/upload/${documentType}`),
  changeStatus: (id, toStatus, notes = '', missingDocs = []) =>
    apiClient.post(`/loans/${id}/status`, { toStatus, notes, missingDocs }),
  chatWithLoan: (id, query) => apiClient.post(`/loans/draft/${id}/chat`, { query }),
  getHistory: (id) => apiClient.get(`/loans/${id}/history`),
  getOcrJobStatus: (jobId) => apiClient.get(`/ocr/jobs/${jobId}`),
};
