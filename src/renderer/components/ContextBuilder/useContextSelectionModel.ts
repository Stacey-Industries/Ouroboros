/**
 * useContextSelectionModel.ts — Context selection model with toggle/select/clear actions.
 */

import { useState, useCallback, useMemo } from 'react';

export interface ContextSelectionIntent {
  type: string
  label: string
}

export interface ContextSelectionGroup {
  label: string
  items: ContextSelectionIntent[]
}

export interface ContextSelectionSummary {
  selectedCount: number
  totalCount: number
}

export interface ContextSelectionConfig {
  groups?: ContextSelectionGroup[]
}

export interface ContextSelectionModel {
  groups: ContextSelectionGroup[]
  summary: ContextSelectionSummary
  isSelected: (groupLabel: string, itemLabel: string) => boolean
  toggleItem: (groupLabel: string, itemLabel: string) => void
  selectAll: () => void
  clearAll: () => void
}

function makeKey(groupLabel: string, itemLabel: string): string {
  return `${groupLabel}::${itemLabel}`;
}

export function useContextSelectionModel(config?: ContextSelectionConfig): ContextSelectionModel {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const groups = config?.groups ?? [];

  const isSelected = useCallback(
    (groupLabel: string, itemLabel: string): boolean => selected.has(makeKey(groupLabel, itemLabel)),
    [selected],
  );

  const toggleItem = useCallback(
    (groupLabel: string, itemLabel: string): void => {
      const key = makeKey(groupLabel, itemLabel);
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });
    },
    [],
  );

  const selectAll = useCallback((): void => {
    const allKeys = new Set<string>();
    for (const group of groups) {
      for (const item of group.items) {
        allKeys.add(makeKey(group.label, item.label));
      }
    }
    setSelected(allKeys);
  }, [groups]);

  const clearAll = useCallback((): void => {
    setSelected(new Set());
  }, []);

  const summary = useMemo<ContextSelectionSummary>(() => {
    let totalCount = 0;
    for (const group of groups) {
      totalCount += group.items.length;
    }
    return { selectedCount: selected.size, totalCount };
  }, [groups, selected]);

  return useMemo<ContextSelectionModel>(
    () => ({ groups, summary, isSelected, toggleItem, selectAll, clearAll }),
    [groups, summary, isSelected, toggleItem, selectAll, clearAll],
  );
}
