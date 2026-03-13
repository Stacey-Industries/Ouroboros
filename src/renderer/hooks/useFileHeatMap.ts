/**
 * useFileHeatMap.ts — Tracks file edit frequency from agent tool calls
 * and provides heat level data for the file tree overlay.
 *
 * Subscribes to agent events (Write/Edit tool calls) and maintains a
 * per-file edit count with time-based decay. Files edited more recently
 * and more frequently appear "hotter".
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAgentEventsContext } from '../contexts/AgentEventsContext';

// ─── Types ───────────────────────────────────────────────────────────────────

export type HeatLevel = 'cold' | 'warm' | 'hot' | 'fire';

export interface FileHeatData {
  editCount: number;
  lastEditTime: number;
  heatLevel: HeatLevel;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Files edited more than this many ms ago lose one heat level */
const DECAY_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

/** Tool names that count as file edits */
const EDIT_TOOL_NAMES = new Set(['Write', 'Edit', 'write', 'edit', 'NotebookEdit']);

/** How often to re-evaluate decay (ms) */
const DECAY_INTERVAL_MS = 60 * 1000; // 1 minute

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Normalize a file path for consistent map lookups (forward slashes, lowercase on Windows) */
function normalizePath(p: string): string {
  const forward = p.replace(/\\/g, '/');
  // On Windows, paths are case-insensitive
  return navigator.userAgent?.includes('Windows') || (typeof process !== 'undefined' && process.platform === 'win32')
    ? forward.toLowerCase()
    : forward;
}

/** Compute heat level from edit count, with optional time decay */
function computeHeatLevel(editCount: number, lastEditTime: number, now: number): HeatLevel {
  if (editCount <= 0) return 'cold';

  const age = now - lastEditTime;
  const decayed = age > DECAY_THRESHOLD_MS;

  // Base level from edit count
  let level: number;
  if (editCount >= 4) level = 3; // fire
  else if (editCount >= 2) level = 2; // hot
  else level = 1; // warm

  // Apply decay: reduce by one level if old
  if (decayed) level = Math.max(0, level - 1);

  switch (level) {
    case 3: return 'fire';
    case 2: return 'hot';
    case 1: return 'warm';
    default: return 'cold';
  }
}

/** Extract the file path from a tool call's input summary string */
function extractFilePath(toolName: string, inputSummary: string): string | null {
  // The input field in ToolCallEvent is a summarized string from summarizeToolInput()
  // For Write/Edit tools, the heuristic picks file_path or path as the summary value
  // So the input string IS the file path (possibly truncated at 80 chars)
  if (!inputSummary || inputSummary.trim().length === 0) return null;

  const trimmed = inputSummary.trim();
  // Skip if it looks like JSON or a command rather than a path
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return null;

  return trimmed;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export interface UseFileHeatMapReturn {
  heatMap: Map<string, FileHeatData>;
  getHeatLevel: (filePath: string) => FileHeatData | undefined;
  resetHeatMap: () => void;
}

export function useFileHeatMap(enabled: boolean): UseFileHeatMapReturn {
  const { currentSessions } = useAgentEventsContext();
  const [heatMap, setHeatMap] = useState<Map<string, FileHeatData>>(new Map());
  const processedCallIdsRef = useRef<Set<string>>(new Set());

  // Scan current sessions for Write/Edit tool calls and build the heat map
  useEffect(() => {
    if (!enabled) return;

    const now = Date.now();
    const rawMap = new Map<string, { editCount: number; lastEditTime: number }>();
    const newProcessedIds = new Set<string>();

    for (const session of currentSessions) {
      for (const tc of session.toolCalls) {
        if (!EDIT_TOOL_NAMES.has(tc.toolName)) continue;

        const filePath = extractFilePath(tc.toolName, tc.input);
        if (!filePath) continue;

        newProcessedIds.add(tc.id);
        const key = normalizePath(filePath);
        const existing = rawMap.get(key);

        if (existing) {
          existing.editCount += 1;
          existing.lastEditTime = Math.max(existing.lastEditTime, tc.timestamp);
        } else {
          rawMap.set(key, { editCount: 1, lastEditTime: tc.timestamp });
        }
      }
    }

    // Only update state if there are actual changes
    const hasNewCalls = [...newProcessedIds].some(id => !processedCallIdsRef.current.has(id))
      || processedCallIdsRef.current.size !== newProcessedIds.size;

    if (hasNewCalls || heatMap.size === 0) {
      processedCallIdsRef.current = newProcessedIds;

      const newHeatMap = new Map<string, FileHeatData>();
      for (const [path, data] of rawMap) {
        newHeatMap.set(path, {
          editCount: data.editCount,
          lastEditTime: data.lastEditTime,
          heatLevel: computeHeatLevel(data.editCount, data.lastEditTime, now),
        });
      }
      setHeatMap(newHeatMap);
    }
  }, [enabled, currentSessions]);

  // Periodic decay re-evaluation
  useEffect(() => {
    if (!enabled || heatMap.size === 0) return;

    const interval = setInterval(() => {
      const now = Date.now();
      setHeatMap((prev) => {
        const next = new Map<string, FileHeatData>();
        let changed = false;

        for (const [path, data] of prev) {
          const newLevel = computeHeatLevel(data.editCount, data.lastEditTime, now);
          if (newLevel !== data.heatLevel) changed = true;
          if (newLevel === 'cold') {
            changed = true; // will be removed
            continue;
          }
          next.set(path, { ...data, heatLevel: newLevel });
        }

        return changed ? next : prev;
      });
    }, DECAY_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [enabled, heatMap.size]);

  const getHeatLevel = useCallback(
    (filePath: string): FileHeatData | undefined => {
      if (!enabled) return undefined;
      return heatMap.get(normalizePath(filePath));
    },
    [enabled, heatMap],
  );

  const resetHeatMap = useCallback(() => {
    setHeatMap(new Map());
    processedCallIdsRef.current.clear();
  }, []);

  return { heatMap, getHeatLevel, resetHeatMap };
}
