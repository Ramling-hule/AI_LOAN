import { useState, useCallback } from 'react';

// ---------------------------------------------------------------------------
// useApi — generic hook for async API calls with loading/error state.
// Usage:
//   const { execute, data, isLoading, error } = useApi(loanApi.getAll);
//   const handleFetch = () => execute({ page: 1 });
// ---------------------------------------------------------------------------

export function useApi(apiFn) {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const execute = useCallback(
    async (...args) => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await apiFn(...args);
        setData(response.data);
        return response.data;
      } catch (err) {
        const message =
          err.response?.data?.message || err.message || 'An unexpected error occurred';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [apiFn]
  );

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setIsLoading(false);
  }, []);

  return { execute, data, isLoading, error, reset };
}
