import apiClient from './apiClient';

// ---------------------------------------------------------------------------
// Audit Log API — wrapper for retrieving admin activity trails
// ---------------------------------------------------------------------------

export const auditLogApi = {
  getLogs: (params) => apiClient.get('/audit-logs', { params }),
};

export default auditLogApi;
