import { useCallback, useEffect, useState } from 'react';

import { OPEN_MULTI_SESSION_EVENT } from '../../hooks/appEventNames';

export interface AgentMonitorModes {
  compareMode: boolean;
  compareSessionIds: [string | null, string | null];
  costMode: boolean;
  filterQuery: string;
  handleMultiSessionClose: () => void;
  handleMultiSessionLaunched: (labels: string[]) => void;
  handleSelectCompareA: (id: string) => void;
  handleSelectCompareB: (id: string) => void;
  handleToggleCompare: () => void;
  handleToggleCost: () => void;
  handleToggleMultiSession: () => void;
  multiBatchLabels: string[];
  multiSessionMode: 'off' | 'launcher' | 'monitor';
  setFilterQuery: (value: string) => void;
}

function useMultiSessionDOMEvent(
  setMultiSessionMode: React.Dispatch<React.SetStateAction<'off' | 'launcher' | 'monitor'>>,
  setCompareMode: React.Dispatch<React.SetStateAction<boolean>>,
  setCostMode: React.Dispatch<React.SetStateAction<boolean>>,
): void {
  useEffect(() => {
    const onOpenMultiSession = (): void => {
      setMultiSessionMode('launcher');
      setCompareMode(false);
      setCostMode(false);
    };
    window.addEventListener(OPEN_MULTI_SESSION_EVENT, onOpenMultiSession);
    return () => window.removeEventListener(OPEN_MULTI_SESSION_EVENT, onOpenMultiSession);
  }, [setMultiSessionMode, setCompareMode, setCostMode]);
}

function useModeToggleHandlers(
  setCompareMode: React.Dispatch<React.SetStateAction<boolean>>,
  setCostMode: React.Dispatch<React.SetStateAction<boolean>>,
  setMultiSessionMode: React.Dispatch<React.SetStateAction<'off' | 'launcher' | 'monitor'>>,
): Pick<
  AgentMonitorModes,
  'handleToggleCompare' | 'handleToggleCost' | 'handleToggleMultiSession'
> {
  return {
    handleToggleCompare: useCallback(() => {
      setCompareMode((value) => !value);
      setCostMode(false);
      setMultiSessionMode('off');
    }, [setCompareMode, setCostMode, setMultiSessionMode]),
    handleToggleCost: useCallback(() => {
      setCostMode((value) => !value);
      setCompareMode(false);
      setMultiSessionMode('off');
    }, [setCompareMode, setCostMode, setMultiSessionMode]),
    handleToggleMultiSession: useCallback(() => {
      setMultiSessionMode((value) => (value === 'off' ? 'launcher' : 'off'));
      setCompareMode(false);
      setCostMode(false);
    }, [setCompareMode, setCostMode, setMultiSessionMode]),
  };
}

function useMultiSessionHandlers(
  setMultiSessionMode: React.Dispatch<React.SetStateAction<'off' | 'launcher' | 'monitor'>>,
  setMultiBatchLabels: React.Dispatch<React.SetStateAction<string[]>>,
): Pick<AgentMonitorModes, 'handleMultiSessionClose' | 'handleMultiSessionLaunched'> {
  return {
    handleMultiSessionLaunched: useCallback(
      (labels: string[]) => {
        setMultiBatchLabels(labels);
        setMultiSessionMode('monitor');
      },
      [setMultiBatchLabels, setMultiSessionMode],
    ),
    handleMultiSessionClose: useCallback(() => {
      setMultiSessionMode('off');
      setMultiBatchLabels([]);
    }, [setMultiBatchLabels, setMultiSessionMode]),
  };
}

function useCompareSelectionHandlers(
  setCompareSessionIds: React.Dispatch<React.SetStateAction<[string | null, string | null]>>,
): Pick<AgentMonitorModes, 'handleSelectCompareA' | 'handleSelectCompareB'> {
  return {
    handleSelectCompareA: useCallback(
      (id: string) => setCompareSessionIds(([, right]) => [id, right]),
      [setCompareSessionIds],
    ),
    handleSelectCompareB: useCallback(
      (id: string) => setCompareSessionIds(([left]) => [left, id]),
      [setCompareSessionIds],
    ),
  };
}

export function useAgentMonitorModes(): AgentMonitorModes {
  const [filterQuery, setFilterQuery] = useState('');
  const [compareMode, setCompareMode] = useState(false);
  const [costMode, setCostMode] = useState(false);
  const [multiSessionMode, setMultiSessionMode] = useState<'off' | 'launcher' | 'monitor'>('off');
  const [multiBatchLabels, setMultiBatchLabels] = useState<string[]>([]);
  const [compareSessionIds, setCompareSessionIds] = useState<[string | null, string | null]>([
    null,
    null,
  ]);
  const toggleHandlers = useModeToggleHandlers(setCompareMode, setCostMode, setMultiSessionMode);
  const multiHandlers = useMultiSessionHandlers(setMultiSessionMode, setMultiBatchLabels);
  const compareHandlers = useCompareSelectionHandlers(setCompareSessionIds);
  useMultiSessionDOMEvent(setMultiSessionMode, setCompareMode, setCostMode);
  return {
    compareMode,
    compareSessionIds,
    costMode,
    filterQuery,
    ...compareHandlers,
    ...multiHandlers,
    ...toggleHandlers,
    multiBatchLabels,
    multiSessionMode,
    setFilterQuery,
  };
}
