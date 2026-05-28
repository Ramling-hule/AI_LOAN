import apiClient from './apiClient.js';

// ---------------------------------------------------------------------------
// Auth API — endpoint wrappers for all authentication routes
// withCredentials: true ensures httpOnly cookies are sent/received
// ---------------------------------------------------------------------------

export const authApi = {
  // ── SME ───────────────────────────────────────────────────────────────────
  smeRegister: (data) =>
    apiClient.post('/auth/sme/register', data, { withCredentials: true }),

  smeLogin: (credentials) =>
    apiClient.post('/auth/sme/login', credentials, { withCredentials: true }),

  // ── Bank Admin ────────────────────────────────────────────────────────────
  bankRegister: (data) =>
    apiClient.post('/auth/bank/register', data, { withCredentials: true }),

  bankLogin: (credentials) =>
    apiClient.post('/auth/bank/login', credentials, { withCredentials: true }),

  // ── Shared ────────────────────────────────────────────────────────────────
  /** Refresh access token using httpOnly cookie */
  refresh: () =>
    apiClient.post('/auth/refresh', {}, { withCredentials: true }),

  /** Logout — clears server-side cookie */
  logout: () =>
    apiClient.post('/auth/logout', {}, { withCredentials: true }),

  /** Get current user info */
  me: () =>
    apiClient.get('/auth/me', { withCredentials: true }),
};
