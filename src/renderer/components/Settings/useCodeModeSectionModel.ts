import { useMemo, useState } from 'react';

import { readStatus } from './codeModeSectionUtils';
import { useCodeModeActions } from './useCodeModeActions';
import { useCodeModeStatus } from './useCodeModeStatus';

export interface CodeModeSectionModel {
  canDisable: boolean;
  canEnable: boolean;
  disabling: boolean;
  enabling: boolean;
  error: string | null;
  fetchStatus: () => Promise<void>;
  generatedTypes: string;
  handleDisable: () => Promise<void>;
  handleEnable: () => Promise<void>;
  isEnabled: boolean;
  isHowItWorksOpen: boolean;
  isTypesOpen: boolean;
  loading: boolean;
  proxiedServers: string[];
  serverNames: string;
  setIsHowItWorksOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsTypesOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setServerNames: React.Dispatch<React.SetStateAction<string>>;
}

export function useCodeModeSectionModel(): CodeModeSectionModel {
  const [serverNames, setServerNames] = useState('');
  const [enabling, setEnabling] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [isTypesOpen, setIsTypesOpen] = useState(false);
  const [isHowItWorksOpen, setIsHowItWorksOpen] = useState(false);
  const { error, fetchStatus, loading, setError, status } = useCodeModeStatus();
  const { handleDisable, handleEnable } = useCodeModeActions({
    fetchStatus,
    serverNames,
    setDisabling,
    setEnabling,
    setError,
  });
  const hasServerNames = useMemo(
    () => serverNames.split(',').some((value) => value.trim().length > 0),
    [serverNames],
  );
  const { generatedTypes, isEnabled, proxiedServers } = readStatus(status);

  return {
    canDisable: !disabling && isEnabled,
    canEnable: !enabling && hasServerNames,
    disabling,
    enabling,
    error,
    fetchStatus,
    generatedTypes,
    handleDisable,
    handleEnable,
    isEnabled,
    isHowItWorksOpen,
    isTypesOpen,
    loading,
    proxiedServers,
    serverNames,
    setIsHowItWorksOpen,
    setIsTypesOpen,
    setServerNames,
  };
}
