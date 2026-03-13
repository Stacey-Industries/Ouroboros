import { useCallback, useEffect, useState } from 'react';
import type { CodeModeStatusResult } from '../../types/electron';
import { getCodeModeApi, getErrorMessage } from './codeModeSectionUtils';

export function useCodeModeStatus(): {
  error: string | null;
  fetchStatus: () => Promise<void>;
  loading: boolean;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  status: CodeModeStatusResult | null;
} {
  const [status, setStatus] = useState<CodeModeStatusResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async (): Promise<void> => {
    const api = getCodeModeApi();
    if (!api) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.getStatus();
      if (result.success) {
        setStatus(result);
      } else {
        setError(result.error ?? 'Failed to fetch status');
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Failed to fetch status'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (!error) {
      return undefined;
    }
    const timeoutId = window.setTimeout(() => setError(null), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [error]);

  return { error, fetchStatus, loading, setError, status };
}
