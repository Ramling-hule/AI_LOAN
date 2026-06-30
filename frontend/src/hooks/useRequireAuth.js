import { useNavigate } from 'react-router-dom';
import { useCallback } from 'react';

import { useAuth } from '@/context/AuthContext.jsx';






export function useRequireAuth(allowedRoles = []) {
  const { user, isAuthenticated, hasRole } = useAuth();
  const navigate = useNavigate();

  const checkAccess = useCallback(() => {
    if (!isAuthenticated) {
      navigate('/login', { replace: true });
      return false;
    }
    if (allowedRoles.length > 0 && !hasRole(...allowedRoles)) {
      navigate('/unauthorized', { replace: true });
      return false;
    }
    return true;
  }, [isAuthenticated, hasRole, allowedRoles, navigate]);

  return { user, checkAccess };
}
