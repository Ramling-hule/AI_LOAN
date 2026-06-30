import apiClient from './apiClient';





export const extractionApi = {
  triggerExtraction: (loanId) => apiClient.post(`/extraction/loans/${loanId}/extract`),
  reExtractLoan: (loanId) => apiClient.post(`/extraction/loans/${loanId}/reextract`),
  getExtractionResult: (loanId) => apiClient.get(`/extraction/loans/${loanId}/extraction`),
};

export default extractionApi;
