import { useCallback, useMemo, useState } from 'react';

import type { WorkbenchSessionItem } from './useWorkbenchSessions';

export interface WorkbenchCompareTarget {
  sessionId: string;
  projectRoot: string;
  threadId: string;
  projectLabel: string;
}

export interface UseWorkbenchCompareOptions {
  items?: WorkbenchSessionItem[];
}

export interface UseWorkbenchCompareResult {
  compareTarget: WorkbenchCompareTarget | null;
  isComparing: boolean;
  canCompare: (item: WorkbenchSessionItem) => boolean;
  openCompare: (sessionId: string) => void;
  closeCompare: () => void;
}

function toCompareTarget(item: WorkbenchSessionItem): WorkbenchCompareTarget | null {
  if (!item.linkedThreadId) return null;
  if (item.status !== 'active') return null;
  if (item.isActive) return null;
  return {
    sessionId: item.id,
    projectRoot: item.projectRoot,
    threadId: item.linkedThreadId,
    projectLabel: item.projectLabel,
  };
}

export function useWorkbenchCompare(
  options: UseWorkbenchCompareOptions = {},
): UseWorkbenchCompareResult {
  const { items = [] } = options;
  const [compareSessionId, setCompareSessionId] = useState<string | null>(null);

  const compareTarget = useMemo(() => {
    if (!compareSessionId) return null;
    const item = items.find((candidate) => candidate.id === compareSessionId) ?? null;
    return item ? toCompareTarget(item) : null;
  }, [compareSessionId, items]);

  const canCompare = useCallback(
    (item: WorkbenchSessionItem) => toCompareTarget(item) !== null,
    [],
  );
  const openCompare = useCallback((sessionId: string) => {
    setCompareSessionId(sessionId);
  }, []);
  const closeCompare = useCallback(() => {
    setCompareSessionId(null);
  }, []);

  return {
    compareTarget,
    isComparing: compareTarget !== null,
    canCompare,
    openCompare,
    closeCompare,
  };
}
