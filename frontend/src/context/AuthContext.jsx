import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { authApi } from '@/api/auth.api.js';
import { useAuthStore } from '@/store/authStore.js';






const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const { user, accessToken, setAuth, clearAuth, setLoading, isLoading, hasRole, getRoleLabel } =
    useAuthStore();

  const [isInitializing, setIsInitializing] = useState(true);

  
  useEffect(() => {
    const tryRefresh = async () => {
      
      
      await new Promise((r) => setTimeout(r, 50));

      const { user: currentUser, accessToken: currentToken } = useAuthStore.getState();

      
      
      if (currentToken) {
        setIsInitializing(false);
        return;
      }

      if (currentUser && !currentToken) {
        try {
          const { data } = await authApi.refresh();
          useAuthStore.getState().setAccessToken(data.data.accessToken);
        } catch (err) {
          
          
          
          const status = err?.response?.status;
          if (status === 401 || status === 403) {
            clearAuth();
          }
          
          
        }
      }
      setIsInitializing(false);
    };
    tryRefresh();
  }, []); 


  
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

  
  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      
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
