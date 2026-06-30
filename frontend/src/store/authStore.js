import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';










export const useAuthStore = create(
  devtools(
    persist(
      (set, get) => ({
        
        user: null,
        accessToken: null,
        isLoading: false,
        error: null,

        
        setUser: (user) => set({ user }),
        setAccessToken: (token) => set({ accessToken: token }),
        setLoading: (isLoading) => set({ isLoading }),
        setError: (error) => set({ error }),

        
        
        setAuth: ({ user, accessToken }) => {
          set({ user, accessToken, error: null });
        },

        
        clearAuth: () => set({ user: null, accessToken: null, error: null }),

        
        isAuthenticated: () => {
          const { user, accessToken } = get();
          return !!(user && accessToken);
        },

        
        hasRole: (...roles) => {
          const { user } = get();
          return user ? roles.includes(user.role) : false;
        },

        
        getRoleLabel: () => {
          const { user } = get();
          if (!user) return '';
          const labels = {
            sme: 'SME Applicant',
            bank_admin: 'Bank Administrator',
            super_admin: 'Super Admin',
          };
          return labels[user.role] || user.role;
        },
      }),
      {
        name: 'ai-loan-auth',
        
        partialize: (state) => ({ user: state.user }),
      }
    ),
    { name: 'AuthStore' }
  )
);
