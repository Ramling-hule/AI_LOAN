import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

// ---------------------------------------------------------------------------
// Auth Store (Zustand)
//
// Single source of truth for authentication state.
// - accessToken stored in memory (this store) — not in localStorage for security
// - refreshToken lives in httpOnly cookie (managed server-side)
// - user object persisted to localStorage via persist middleware
// ---------------------------------------------------------------------------

export const useAuthStore = create(
  devtools(
    persist(
      (set, get) => ({
        // ── State ───────────────────────────────────────────────────────────
        user: null,
        accessToken: null,
        isLoading: false,
        error: null,

        // ── Setters ─────────────────────────────────────────────────────────
        setUser: (user) => set({ user }),
        setAccessToken: (token) => set({ accessToken: token }),
        setLoading: (isLoading) => set({ isLoading }),
        setError: (error) => set({ error }),

        // ── Auth actions ─────────────────────────────────────────────────────
        /**
         * Called after successful login/register from the API.
         * @param {{ user: object, accessToken: string }} payload
         */
        setAuth: ({ user, accessToken }) => {
          set({ user, accessToken, error: null });
        },

        /**
         * Clear all auth state on logout.
         */
        clearAuth: () => set({ user: null, accessToken: null, error: null }),

        // ── Derived helpers ──────────────────────────────────────────────────
        isAuthenticated: () => {
          const { user, accessToken } = get();
          return !!(user && accessToken);
        },

        /**
         * Check if the current user has one of the given roles.
         * @param {...string} roles - e.g. 'sme', 'bank_admin', 'super_admin'
         */
        hasRole: (...roles) => {
          const { user } = get();
          return user ? roles.includes(user.role) : false;
        },

        /**
         * Returns the role-specific display label.
         */
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
        // Only persist user object; access token is re-fetched via refresh cookie
        partialize: (state) => ({ user: state.user }),
      }
    ),
    { name: 'AuthStore' }
  )
);
