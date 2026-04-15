/**
 * viewModeFilter.ts — Pure filter helpers for AgentMonitor view modes.
 *
 * verbose: show all events
 * normal:  hide file_changed and cwd_changed (noisy)
 * summary: show only key lifecycle/failure events
 */

import type { AgentMonitorViewMode } from '../../types/electron';

// ─── Constants ────────────────────────────────────────────────────────────────

const NORMAL_HIDDEN: ReadonlySet<string> = new Set(['file_changed', 'cwd_changed']);

const SUMMARY_ALLOWED: ReadonlySet<string> = new Set([
  'pre_tool_use',
  'post_tool_use_failure',
  'user_prompt_submit',
  'notification',
  'session_start',
  'session_end',
]);

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns true if the given event type should be visible in the specified view mode.
 */
export function isEventTypeVisible(eventType: string, viewMode: AgentMonitorViewMode): boolean {
  if (viewMode === 'verbose') return true;
  if (viewMode === 'normal') return !NORMAL_HIDDEN.has(eventType);
  // summary
  return SUMMARY_ALLOWED.has(eventType);
}

/**
 * Filters an array of items that have a `type` string field by the given view mode.
 */
export function filterByViewMode<T extends { type: string }>(
  items: T[],
  viewMode: AgentMonitorViewMode,
): T[] {
  if (viewMode === 'verbose') return items;
  return items.filter((item) => isEventTypeVisible(item.type, viewMode));
}
