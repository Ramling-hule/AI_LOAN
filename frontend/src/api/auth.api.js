import apiClient from './apiClient.js';






export const authApi = {
  
  smeRegister: (data) =>
    apiClient.post('/auth/sme/register', data, { withCredentials: true }),

  smeLogin: (credentials) =>
    apiClient.post('/auth/sme/login', credentials, { withCredentials: true }),

  
  bankRegister: (data) =>
    apiClient.post('/auth/bank/register', data, { withCredentials: true }),

  bankLogin: (credentials) =>
    apiClient.post('/auth/bank/login', credentials, { withCredentials: true }),

  
  
  refresh: () =>
    apiClient.post('/auth/refresh', {}, { withCredentials: true }),

  
  logout: () =>
    apiClient.post('/auth/logout', {}, { withCredentials: true }),

  
  mfaVerify: (tempToken, code) =>
    apiClient.post('/auth/mfa/verify', { tempToken, code }, { withCredentials: true }),

  
  me: () =>
    apiClient.get('/auth/me', { withCredentials: true }),
};
