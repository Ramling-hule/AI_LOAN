import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { authApi } from '@/api/auth.api.js';
import { useAuthStore } from '@/store/authStore.js';

// ---------------------------------------------------------------------------
// AuthContext — provides auth actions (login, logout, register) via React context
// State itself lives in Zustand (useAuthStore) for cross-component access.
// ---------------------------------------------------------------------------

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const { user, accessToken, setAuth, clearAuth, setLoading, isLoading, hasRole, getRoleLabel } =
    useAuthStore();

  const [isInitializing, setIsInitializing] = useState(true);

  // ── On mount: attempt silent token refresh ──────────────────────────────
  useEffect(() => {
    const tryRefresh = async () => {
      // Small delay lets a just-completed MFA login's setAuth() settle in store
      // before this check runs — prevents a race condition on navigation.
      await new Promise((r) => setTimeout(r, 50));

      const { user: currentUser, accessToken: currentToken } = useAuthStore.getState();

      // If we already have both user + token (e.g. just completed MFA login),
      // skip the refresh entirely — no need to hit the network.
      if (currentToken) {
        setIsInitializing(false);
        return;
      }

      if (currentUser && !currentToken) {
        try {
          const { data } = await authApi.refresh();
          useAuthStore.getState().setAccessToken(data.data.accessToken);
        } catch (err) {
          // Only clear auth on definitive rejection (401/403).
          // Network errors or 5xx should NOT log the user out — they may
          // have a valid session that is temporarily unreachable.
          const status = err?.response?.status;
          if (status === 401 || status === 403) {
            clearAuth();
          }
          // Otherwise: keep the user state intact; the 401 interceptor in
          // apiClient.js will handle re-auth when a protected request is made.
        }
      }
      setIsInitializing(false);
    };
    tryRefresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


  // ── SME login ──────────────────────────────────────────────────────────
  const loginSME = useCallback(async (credentials) => {
    setLoading(true);
    try {
      const { data } = await authApi.smeLogin(credentials);
      if (data.data.mfaRequired) {
        return { mfaRequired: true, tempToken: data.data.tempToken };
      }
      setAuth({ user: data.data.user, accessToken: data.data.accessToken });
      return data.data.user;
    } finally {
      setLoading(false);
    }
  }, [setAuth, setLoading]);

  // ── SME register ───────────────────────────────────────────────────────
  const registerSME = useCallback(async (formData) => {
    setLoading(true);
    try {
      const { data } = await authApi.smeRegister(formData);
      if (data.data.mfaRequired) {
        return { mfaRequired: true, tempToken: data.data.tempToken, user: data.data.user };
      }
      setAuth({ user: data.data.user, accessToken: data.data.accessToken });
      return data.data.user;
    } finally {
      setLoading(false);
    }
  }, [setAuth, setLoading]);

  // ── Bank admin login ───────────────────────────────────────────────────
  const loginBank = useCallback(async (credentials) => {
    setLoading(true);
    try {
      const { data } = await authApi.bankLogin(credentials);
      if (data.data.mfaRequired) {
        return { mfaRequired: true, tempToken: data.data.tempToken };
      }
      setAuth({ user: data.data.user, accessToken: data.data.accessToken });
      return data.data.user;
    } finally {
      setLoading(false);
    }
  }, [setAuth, setLoading]);

  // ── Bank admin register ────────────────────────────────────────────────
  const registerBank = useCallback(async (formData) => {
    setLoading(true);
    try {
      const { data } = await authApi.bankRegister(formData);
      if (data.data.mfaRequired) {
        return { mfaRequired: true, tempToken: data.data.tempToken, user: data.data.user };
      }
      setAuth({ user: data.data.user, accessToken: data.data.accessToken });
      return data.data.user;
    } finally {
      setLoading(false);
    }
  }, [setAuth, setLoading]);

  // ── MFA Verification ───────────────────────────────────────────────────
  const verifyMfa = useCallback(async (tempToken, code) => {
    setLoading(true);
    try {
      const { data } = await authApi.mfaVerify(tempToken, code);
      setAuth({ user: data.data.user, accessToken: data.data.accessToken });
      return data.data.user;
    } finally {
      setLoading(false);
    }
  }, [setAuth, setLoading]);

  // ── Logout ─────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Always clear state even if API call fails
    } finally {
      clearAuth();
    }
  }, [clearAuth]);

  const isAuthenticated = !!(user && accessToken);

  const value = {
    user,
    accessToken,
    isLoading,
    isInitializing,
    isAuthenticated,
    loginSME,
    loginBank,
    registerSME,
    registerBank,
    verifyMfa,
    logout,
    hasRole: (...roles) => hasRole(...roles),
    getRoleLabel,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
