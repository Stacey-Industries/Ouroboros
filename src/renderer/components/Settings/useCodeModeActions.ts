import { useCallback } from 'react';
import type { IpcResult } from '../../types/electron';
import { getCodeModeApi, getErrorMessage, parseServerNames } from './codeModeSectionUtils';

function useStatusActionRunner({
  fetchStatus,
  setError,
}: {
  fetchStatus: () => Promise<void>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}): (
  action: () => Promise<IpcResult>,
  fallbackMessage: string,
  setPending: React.Dispatch<React.SetStateAction<boolean>>,
) => Promise<void> {
  return useCallback(
    async (action, fallbackMessage, setPending): Promise<void> => {
      setPending(true);
      setError(null);

      try {
        const result = await action();
        if (result.success) {
          await fetchStatus();
        } else {
          setError(result.error ?? fallbackMessage);
        }
      } catch (requestError) {
        setError(getErrorMessage(requestError, fallbackMessage));
      } finally {
        setPending(false);
      }
    },
    [fetchStatus, setError],
  );
}

export function useCodeModeActions({
  fetchStatus,
  serverNames,
  setDisabling,
  setEnabling,
  setError,
}: {
  fetchStatus: () => Promise<void>;
  serverNames: string;
  setDisabling: React.Dispatch<React.SetStateAction<boolean>>;
  setEnabling: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}): {
  handleDisable: () => Promise<void>;
  handleEnable: () => Promise<void>;
} {
  const runAction = useStatusActionRunner({ fetchStatus, setError });

  const handleEnable = useCallback(async (): Promise<void> => {
    const api = getCodeModeApi();
    const names = parseServerNames(serverNames);
    if (!api || names.length === 0) {
      return;
    }

    await runAction(() => api.enable(names, 'global'), 'Failed to enable Code Mode', setEnabling);
  }, [runAction, serverNames, setEnabling]);

  const handleDisable = useCallback(async (): Promise<void> => {
    const api = getCodeModeApi();
    if (!api) {
      return;
    }

    await runAction(() => api.disable(), 'Failed to disable Code Mode', setDisabling);
  }, [runAction, setDisabling]);

  return { handleDisable, handleEnable };
}
