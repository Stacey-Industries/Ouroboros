import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { useCallback, useState } from 'react';

import type { InstalledVsxExtension } from '../../types/electron';
import type { ExtensionStoreSource } from './extensionStoreModel';
import {
  getExtensionStoreApi,
  runExtensionInstall,
  runExtensionToggle,
  runExtensionUninstall,
  runRefreshInstalled,
} from './extensionStoreModel.helpers';

type InventoryArgs = {
  sourceRef: MutableRefObject<ExtensionStoreSource>;
  setError: (error: string | null) => void;
};

function useInstallCallback(
  sourceRef: MutableRefObject<ExtensionStoreSource>,
  setError: (error: string | null) => void,
  setInstallInProgress: (id: string | null) => void,
  setInstalledMap: Dispatch<SetStateAction<Map<string, InstalledVsxExtension>>>,
) {
  return useCallback(
    (namespace: string, name: string) => {
      void runExtensionInstall({
        api: getExtensionStoreApi(),
        source: sourceRef.current,
        namespace,
        name,
        setInstallInProgress,
        setInstalledMap,
        setError,
      });
    },
    [setError, sourceRef, setInstallInProgress, setInstalledMap],
  );
}

export function useExtensionStoreInventoryState({ sourceRef, setError }: InventoryArgs) {
  const [installedMap, setInstalledMap] = useState<Map<string, InstalledVsxExtension>>(new Map());
  const [disabledIds, setDisabledIds] = useState<Set<string>>(new Set());
  const [installInProgress, setInstallInProgress] = useState<string | null>(null);

  const install = useInstallCallback(sourceRef, setError, setInstallInProgress, setInstalledMap);

  const uninstall = useCallback(
    (id: string) => {
      void runExtensionUninstall({
        api: getExtensionStoreApi(),
        id,
        setInstalledMap,
        setDisabledIds,
        setError,
      });
    },
    [setError],
  );
  const toggleEnabled = useCallback(
    (id: string) => {
      void runExtensionToggle({
        api: getExtensionStoreApi(),
        id,
        isDisabled: disabledIds.has(id),
        setDisabledIds,
        setError,
      });
    },
    [disabledIds, setError],
  );
  const refreshInstalled = useCallback(() => {
    void runRefreshInstalled({ api: getExtensionStoreApi(), setInstalledMap });
  }, []);

  return { installedMap, disabledIds, installInProgress, install, uninstall, toggleEnabled, refreshInstalled };
}
