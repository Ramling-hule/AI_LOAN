import apiClient from './apiClient';





export const auditLogApi = {
  getLogs: (params) => apiClient.get('/audit-logs', { params }),
};

export default auditLogApi;
