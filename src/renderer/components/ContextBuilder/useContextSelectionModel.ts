/**
 * useContextSelectionModel.ts — Context selection model with toggle/select/clear actions.
 */

import { useCallback, useMemo, useState } from 'react';

import type { ContextBudgetSummary, ContextPacket, OmittedContextCandidate, RankedContextFile, TaskRequestContextSelection } from '../../types/electron';

// ─── Intent type for picker actions ───────────────────────────────────────────

export type ContextSelectionIntent = 'pin' | 'include' | 'exclude';

// ─── Group/item types for the checkbox-based selection UI ─────────────────────

export interface ContextSelectionIntentItem {
  type: string
  label: string
}

export interface ContextSelectionGroup {
  label: string
  items: ContextSelectionIntentItem[]
}

export interface ContextSelectionSummary {
  selectedCount: number
  totalCount: number
  userSelectedCount: number
  pinnedCount: number
  includedCount: number
  excludedCount: number
  previewCount: number
  omittedCount: number
}

export interface ContextSelectionConfig {
  groups?: ContextSelectionGroup[]
  previewPacket?: Pick<ContextPacket, 'budget' | 'files' | 'omittedCandidates'> | null
}

export interface SelectionGroup {
  key: string
  label: string
  files: string[]
}

export interface ContextSelectionModel {
  // Checkbox UI groups (for ContextSelectionSection)
  groups: ContextSelectionGroup[]
  summary: ContextSelectionSummary
  isSelected: (groupLabel: string, itemLabel: string) => boolean
  toggleItem: (groupLabel: string, itemLabel: string) => void
  selectAll: () => void
  clearAll: () => void
  // File-level selection (for OrchestrationTaskComposer)
  selection: Partial<TaskRequestContextSelection>
  selectionGroups: SelectionGroup[]
  previewFiles: RankedContextFile[]
  omittedCandidates: OmittedContextCandidate[]
  budget: ContextBudgetSummary | undefined
  isPinned: (filePath: string) => boolean
  isIncluded: (filePath: string) => boolean
  isExcluded: (filePath: string) => boolean
  togglePinned: (filePath: string) => void
  toggleIncluded: (filePath: string) => void
  toggleExcluded: (filePath: string) => void
  handleOpenFile: (filePath: string) => void
  removeFile: (groupKey: string, filePath: string) => void
}

// ─── Pure helper functions ────────────────────────────────────────────────────

function normalizeSlash(path: string): string {
  return path.replace(/\\/g, '/').trim();
}

function dedupe(paths: string[]): string[] {
  return [...new Set(paths.map(normalizeSlash).filter(Boolean))];
}

export function normalizeSelection(partial: Partial<TaskRequestContextSelection>): TaskRequestContextSelection {
  return {
    userSelectedFiles: dedupe(partial.userSelectedFiles ?? []),
    pinnedFiles: dedupe(partial.pinnedFiles ?? []),
    includedFiles: dedupe(partial.includedFiles ?? []),
    excludedFiles: dedupe(partial.excludedFiles ?? []),
  };
}

export function togglePinnedSelection(
  selection: TaskRequestContextSelection,
  filePath: string,
): TaskRequestContextSelection {
  const norm = normalizeSlash(filePath);
  const alreadyPinned = selection.pinnedFiles.includes(norm);
  return normalizeSelection({
    ...selection,
    pinnedFiles: alreadyPinned
      ? selection.pinnedFiles.filter((f) => normalizeSlash(f) !== norm)
      : [...selection.pinnedFiles, norm],
    excludedFiles: selection.excludedFiles.filter((f) => normalizeSlash(f) !== norm),
  });
}

export function toggleIncludedSelection(
  selection: TaskRequestContextSelection,
  filePath: string,
): TaskRequestContextSelection {
  const norm = normalizeSlash(filePath);
  const alreadyIncluded = selection.includedFiles.includes(norm);
  return normalizeSelection({
    ...selection,
    includedFiles: alreadyIncluded
      ? selection.includedFiles.filter((f) => normalizeSlash(f) !== norm)
      : [...selection.includedFiles, norm],
    excludedFiles: selection.excludedFiles.filter((f) => normalizeSlash(f) !== norm),
  });
}

export function toggleExcludedSelection(
  selection: TaskRequestContextSelection,
  filePath: string,
): TaskRequestContextSelection {
  const norm = normalizeSlash(filePath);
  const alreadyExcluded = selection.excludedFiles.includes(norm);
  if (alreadyExcluded) {
    return normalizeSelection({
      ...selection,
      excludedFiles: selection.excludedFiles.filter((f) => normalizeSlash(f) !== norm),
    });
  }

  return normalizeSelection({
    ...selection,
    pinnedFiles: selection.pinnedFiles.filter((f) => normalizeSlash(f) !== norm),
    includedFiles: selection.includedFiles.filter((f) => normalizeSlash(f) !== norm),
    excludedFiles: [...selection.excludedFiles, norm],
  });
}

export function updateSelectionForIntent(
  selection: TaskRequestContextSelection,
  intent: ContextSelectionIntent,
  filePath: string,
): TaskRequestContextSelection {
  if (intent === 'pin') return togglePinnedSelection(selection, filePath);
  if (intent === 'exclude') return toggleExcludedSelection(selection, filePath);
  return toggleIncludedSelection(selection, filePath);
}

// ─── Internal checkbox model helpers ─────────────────────────────────────────

function makeKey(groupLabel: string, itemLabel: string): string {
  return `${groupLabel}::${itemLabel}`;
}

function collectAllKeys(groups: ContextSelectionGroup[]): Set<string> {
  const allKeys = new Set<string>();
  for (const group of groups) {
    for (const item of group.items) {
      allKeys.add(makeKey(group.label, item.label));
    }
  }
  return allKeys;
}

interface ComputeSummaryArgs {
  groups: ContextSelectionGroup[];
  selectedSize: number;
  fileSelection: TaskRequestContextSelection;
  previewCount: number;
  omittedCount: number;
}

function computeSummary({ groups, selectedSize, fileSelection, previewCount, omittedCount }: ComputeSummaryArgs): ContextSelectionSummary {
  let totalCount = 0;
  for (const group of groups) totalCount += group.items.length;
  return {
    selectedCount: selectedSize,
    totalCount,
    userSelectedCount: fileSelection.userSelectedFiles.length,
    pinnedCount: fileSelection.pinnedFiles.length,
    includedCount: fileSelection.includedFiles.length,
    excludedCount: fileSelection.excludedFiles.length,
    previewCount,
    omittedCount,
  };
}

function emptySelection(): TaskRequestContextSelection {
  return { userSelectedFiles: [], pinnedFiles: [], includedFiles: [], excludedFiles: [] };
}

function buildSelectionGroups(fileSelection: TaskRequestContextSelection): SelectionGroup[] {
  const groups: SelectionGroup[] = [];
  if (fileSelection.pinnedFiles.length > 0) {
    groups.push({ key: 'pinnedFiles', label: 'Pinned files', files: fileSelection.pinnedFiles });
  }
  if (fileSelection.includedFiles.length > 0) {
    groups.push({ key: 'includedFiles', label: 'Included files', files: fileSelection.includedFiles });
  }
  if (fileSelection.excludedFiles.length > 0) {
    groups.push({ key: 'excludedFiles', label: 'Excluded files', files: fileSelection.excludedFiles });
  }
  if (fileSelection.userSelectedFiles.length > 0) {
    groups.push({ key: 'userSelectedFiles', label: 'User-selected files', files: fileSelection.userSelectedFiles });
  }
  return groups;
}

// ─── Hook helpers ─────────────────────────────────────────────────────────────

function useCheckboxSelection(groups: ContextSelectionGroup[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const isSelected = useCallback(
    (groupLabel: string, itemLabel: string) => selected.has(makeKey(groupLabel, itemLabel)),
    [selected],
  );
  const toggleItem = useCallback((groupLabel: string, itemLabel: string): void => {
    const key = makeKey(groupLabel, itemLabel);
    setSelected((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  }, []);
  const selectAll = useCallback((): void => setSelected(collectAllKeys(groups)), [groups]);
  const clearAll = useCallback((): void => setSelected(new Set()), []);
  return { selected, isSelected, toggleItem, selectAll, clearAll };
}

function useFileSelectionCallbacks() {
  const [fileSelection, setFileSelection] = useState<TaskRequestContextSelection>(emptySelection);
  const isPinned = useCallback((f: string) => fileSelection.pinnedFiles.includes(normalizeSlash(f)), [fileSelection]);
  const isIncluded = useCallback((f: string) => fileSelection.includedFiles.includes(normalizeSlash(f)), [fileSelection]);
  const isExcluded = useCallback((f: string) => fileSelection.excludedFiles.includes(normalizeSlash(f)), [fileSelection]);
  const togglePinned = useCallback((f: string) => setFileSelection((p) => togglePinnedSelection(p, f)), []);
  const toggleIncluded = useCallback((f: string) => setFileSelection((p) => toggleIncludedSelection(p, f)), []);
  const toggleExcluded = useCallback((f: string) => setFileSelection((p) => toggleExcludedSelection(p, f)), []);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- file opening handled at IDE layer; intentional no-op
  const handleOpenFile = useCallback((_f: string): void => undefined, []);
  const removeFile = useCallback((groupKey: string, filePath: string): void => {
    setFileSelection((prev) => {
      const norm = normalizeSlash(filePath);
      const key = groupKey as keyof TaskRequestContextSelection;
      if (!Array.isArray(prev[key])) return prev;
      return normalizeSelection({ ...prev, [key]: (prev[key] as string[]).filter((f) => normalizeSlash(f) !== norm) });
    });
  }, []);
  return { fileSelection, isPinned, isIncluded, isExcluded, togglePinned, toggleIncluded, toggleExcluded, handleOpenFile, removeFile };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useContextSelectionModel(config?: ContextSelectionConfig): ContextSelectionModel {
  const groups = useMemo(() => config?.groups ?? [], [config?.groups]);
  const previewPacket = config?.previewPacket ?? null;
  const previewFiles: RankedContextFile[] = useMemo(() => previewPacket?.files ?? [], [previewPacket]);
  const omittedCandidates: OmittedContextCandidate[] = useMemo(() => previewPacket?.omittedCandidates ?? [], [previewPacket]);
  const budget = previewPacket?.budget;

  const { selected, isSelected, toggleItem, selectAll, clearAll } = useCheckboxSelection(groups);
  const { fileSelection, isPinned, isIncluded, isExcluded, togglePinned, toggleIncluded, toggleExcluded, handleOpenFile, removeFile } = useFileSelectionCallbacks();

  const selectionGroups = useMemo(() => buildSelectionGroups(fileSelection), [fileSelection]);
  const summary = useMemo(
    () => computeSummary({ groups, selectedSize: selected.size, fileSelection, previewCount: previewFiles.length, omittedCount: omittedCandidates.length }),
    [groups, selected, fileSelection, previewFiles, omittedCandidates],
  );

  return useMemo<ContextSelectionModel>(
    () => ({
      groups, summary, isSelected, toggleItem, selectAll, clearAll,
      selection: fileSelection, selectionGroups, previewFiles, omittedCandidates, budget,
      isPinned, isIncluded, isExcluded, togglePinned, toggleIncluded, toggleExcluded,
      handleOpenFile, removeFile,
    }),
    [groups, summary, isSelected, toggleItem, selectAll, clearAll, fileSelection, selectionGroups,
      previewFiles, omittedCandidates, budget, isPinned, isIncluded, isExcluded,
      togglePinned, toggleIncluded, toggleExcluded, handleOpenFile, removeFile],
  );
}
