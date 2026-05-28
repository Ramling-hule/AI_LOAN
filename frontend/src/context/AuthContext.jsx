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
      // If we have a persisted user but no access token, try to refresh silently
      if (user && !accessToken) {
        try {
          const { data } = await authApi.refresh();
          useAuthStore.getState().setAccessToken(data.data.accessToken);
        } catch {
          // Refresh failed — clear stale user data
          clearAuth();
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
