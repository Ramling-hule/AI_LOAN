// ---------------------------------------------------------------------------
// Underwriting API — wrapper for underwriting endpoints
// ---------------------------------------------------------------------------

import apiClient from './apiClient';

export const underwritingApi = {
  assessLoan: (loanId) => apiClient.post(`/underwriting/loans/${loanId}/assess`),
  getReport: (loanId) => apiClient.get(`/underwriting/loans/${loanId}/report`),
  reevaluateLoan: (loanId) => apiClient.post(`/underwriting/loans/${loanId}/reevaluate`),
  notifyPolicyIssue: (loanId, policyTitle, details) => apiClient.post(`/underwriting/loans/${loanId}/notify-policy-issue`, { policyTitle, details }),
};

export default underwritingApi;
