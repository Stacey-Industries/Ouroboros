import { useCallback, useEffect, useState } from 'react';

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

export function useAgentMonitorModes(): AgentMonitorModes {
  const [filterQuery, setFilterQuery] = useState('');
  const [compareMode, setCompareMode] = useState(false);
  const [costMode, setCostMode] = useState(false);
  const [multiSessionMode, setMultiSessionMode] = useState<'off' | 'launcher' | 'monitor'>('off');
  const [multiBatchLabels, setMultiBatchLabels] = useState<string[]>([]);
  const [compareSessionIds, setCompareSessionIds] = useState<[string | null, string | null]>([null, null]);
  const handleToggleCompare = useCallback(() => { setCompareMode((value) => !value); setCostMode(false); setMultiSessionMode('off'); }, []);
  const handleToggleCost = useCallback(() => { setCostMode((value) => !value); setCompareMode(false); setMultiSessionMode('off'); }, []);
  const handleToggleMultiSession = useCallback(() => { setMultiSessionMode((value) => (value === 'off' ? 'launcher' : 'off')); setCompareMode(false); setCostMode(false); }, []);
  const handleMultiSessionLaunched = useCallback((labels: string[]) => { setMultiBatchLabels(labels); setMultiSessionMode('monitor'); }, []);
  const handleMultiSessionClose = useCallback(() => { setMultiSessionMode('off'); setMultiBatchLabels([]); }, []);
  const handleSelectCompareA = useCallback((id: string) => setCompareSessionIds(([, right]) => [id, right]), []);
  const handleSelectCompareB = useCallback((id: string) => setCompareSessionIds(([left]) => [left, id]), []);

  useEffect(() => {
    const onOpenMultiSession = () => { setMultiSessionMode('launcher'); setCompareMode(false); setCostMode(false); };
    window.addEventListener('agent-ide:open-multi-session', onOpenMultiSession);
    return () => window.removeEventListener('agent-ide:open-multi-session', onOpenMultiSession);
  }, []);

  return {
    compareMode,
    compareSessionIds,
    costMode,
    filterQuery,
    handleMultiSessionClose,
    handleMultiSessionLaunched,
    handleSelectCompareA,
    handleSelectCompareB,
    handleToggleCompare,
    handleToggleCost,
    handleToggleMultiSession,
    multiBatchLabels,
    multiSessionMode,
    setFilterQuery,
  };
}
