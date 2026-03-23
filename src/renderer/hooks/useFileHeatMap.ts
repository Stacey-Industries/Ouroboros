/**
 * useFileHeatMap.ts tracks file edit frequency from agent tool calls
 * and provides heat level data for the file tree overlay.
 *
 * Subscribes to agent events (Write/Edit tool calls) and maintains a
 * per-file edit count with time-based decay. Files edited more recently
 * and more frequently appear hotter.
 */

import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { useAgentEventsContext } from '../contexts/AgentEventsContext';
import type { UseAgentEventsReturn } from './useAgentEvents';

export type HeatLevel = 'cold' | 'warm' | 'hot' | 'fire';

export interface FileHeatData {
  editCount: number;
  lastEditTime: number;
  heatLevel: HeatLevel;
}

const DECAY_THRESHOLD_MS = 30 * 60 * 1000;
const DECAY_INTERVAL_MS = 60 * 1000;
const EDIT_TOOL_NAMES = new Set(['Write', 'Edit', 'write', 'edit', 'NotebookEdit']);

type SessionList = UseAgentEventsReturn['currentSessions'];
type ToolCall = SessionList[number]['toolCalls'][number];
type HeatMapState = Map<string, FileHeatData>;
type SetHeatMap = Dispatch<SetStateAction<HeatMapState>>;

interface RawHeatEntry {
  editCount: number;
  lastEditTime: number;
}

interface HeatMapSyncOptions {
  enabled: boolean;
  currentSessions: SessionList;
  heatMapSize: number;
  processedCallIdsRef: MutableRefObject<Set<string>>;
  setHeatMap: SetHeatMap;
}

interface HeatMapDecayOptions {
  enabled: boolean;
  heatMapSize: number;
  setHeatMap: SetHeatMap;
}

function normalizePath(filePath: string): string {
  const normalizedPath = filePath.replace(/\\/g, '/');
  return navigator.userAgent?.includes('Windows') || (typeof process !== 'undefined' && process.platform === 'win32')
    ? normalizedPath.toLowerCase()
    : normalizedPath;
}

function computeHeatLevel(editCount: number, lastEditTime: number, now: number): HeatLevel {
  if (editCount <= 0) {
    return 'cold';
  }

  const age = now - lastEditTime;
  let level = editCount >= 4 ? 3 : editCount >= 2 ? 2 : 1;

  if (age > DECAY_THRESHOLD_MS) {
    level = Math.max(0, level - 1);
  }

  switch (level) {
    case 3:
      return 'fire';
    case 2:
      return 'hot';
    case 1:
      return 'warm';
    default:
      return 'cold';
  }
}

function extractFilePath(inputSummary: string): string | null {
  if (!inputSummary || inputSummary.trim().length === 0) {
    return null;
  }

  const trimmed = inputSummary.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[') ? null : trimmed;
}

function recordEditToolCall(
  rawMap: Map<string, RawHeatEntry>,
  processedIds: Set<string>,
  toolCall: ToolCall,
): void {
  if (!EDIT_TOOL_NAMES.has(toolCall.toolName)) {
    return;
  }

  const filePath = extractFilePath(toolCall.input);
  if (!filePath) {
    return;
  }

  processedIds.add(toolCall.id);
  const key = normalizePath(filePath);
  const existing = rawMap.get(key);

  if (!existing) {
    rawMap.set(key, { editCount: 1, lastEditTime: toolCall.timestamp });
    return;
  }

  existing.editCount += 1;
  existing.lastEditTime = Math.max(existing.lastEditTime, toolCall.timestamp);
}

function collectRawHeatData(currentSessions: SessionList): { rawMap: Map<string, RawHeatEntry>; processedIds: Set<string> } {
  const rawMap = new Map<string, RawHeatEntry>();
  const processedIds = new Set<string>();

  for (const session of currentSessions) {
    for (const toolCall of session.toolCalls) {
      recordEditToolCall(rawMap, processedIds, toolCall);
    }
  }

  return { rawMap, processedIds };
}

function haveProcessedIdsChanged(previous: Set<string>, next: Set<string>): boolean {
  if (previous.size !== next.size) {
    return true;
  }

  for (const id of next) {
    if (!previous.has(id)) {
      return true;
    }
  }

  return false;
}

function buildHeatMap(rawMap: Map<string, RawHeatEntry>, now: number): HeatMapState {
  const nextHeatMap = new Map<string, FileHeatData>();

  for (const [path, data] of rawMap) {
    nextHeatMap.set(path, {
      editCount: data.editCount,
      lastEditTime: data.lastEditTime,
      heatLevel: computeHeatLevel(data.editCount, data.lastEditTime, now),
    });
  }

  return nextHeatMap;
}

function syncHeatMapFromSessions({
  enabled,
  currentSessions,
  heatMapSize,
  processedCallIdsRef,
  setHeatMap,
}: HeatMapSyncOptions): void {
  if (!enabled) {
    return;
  }

  const { rawMap, processedIds } = collectRawHeatData(currentSessions);
  if (!haveProcessedIdsChanged(processedCallIdsRef.current, processedIds) && heatMapSize !== 0) {
    return;
  }

  processedCallIdsRef.current = processedIds;
  setHeatMap(buildHeatMap(rawMap, Date.now()));
}

function applyHeatDecay(previous: HeatMapState, now: number): HeatMapState {
  const next = new Map<string, FileHeatData>();
  let changed = false;

  for (const [path, data] of previous) {
    const heatLevel = computeHeatLevel(data.editCount, data.lastEditTime, now);
    if (heatLevel !== data.heatLevel) {
      changed = true;
    }

    if (heatLevel === 'cold') {
      changed = true;
      continue;
    }

    next.set(path, { ...data, heatLevel });
  }

  return changed ? next : previous;
}

function createDecayInterval({ enabled, heatMapSize, setHeatMap }: HeatMapDecayOptions): (() => void) | undefined {
  if (!enabled || heatMapSize === 0) {
    return undefined;
  }

  const interval = setInterval(() => {
    setHeatMap((previous) => applyHeatDecay(previous, Date.now()));
  }, DECAY_INTERVAL_MS);

  return () => clearInterval(interval);
}

function resetHeatMapState(setHeatMap: SetHeatMap, processedCallIdsRef: MutableRefObject<Set<string>>): void {
  setHeatMap(new Map());
  processedCallIdsRef.current.clear();
}

export interface UseFileHeatMapReturn {
  heatMap: Map<string, FileHeatData>;
  getHeatLevel: (filePath: string) => FileHeatData | undefined;
  resetHeatMap: () => void;
}

export function useFileHeatMap(enabled: boolean): UseFileHeatMapReturn {
  const { currentSessions } = useAgentEventsContext();
  const [heatMap, setHeatMap] = useState<HeatMapState>(new Map());
  const processedCallIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    syncHeatMapFromSessions({ enabled, currentSessions, heatMapSize: heatMap.size, processedCallIdsRef, setHeatMap });
  }, [enabled, currentSessions, heatMap.size]);

  useEffect(() => createDecayInterval({ enabled, heatMapSize: heatMap.size, setHeatMap }), [enabled, heatMap.size]);

  const getHeatLevel = useCallback(
    (filePath: string): FileHeatData | undefined => (enabled ? heatMap.get(normalizePath(filePath)) : undefined),
    [enabled, heatMap],
  );
  const resetHeatMap = useCallback(() => {
    resetHeatMapState(setHeatMap, processedCallIdsRef);
  }, []);

  return { heatMap, getHeatLevel, resetHeatMap };
}
