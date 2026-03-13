/**
 * timelineHelpers.ts — Shared helpers for timeline and feed components.
 */

/** Color mapping for tool types in timelines. */
export const TOOL_TIMELINE_COLOR: Record<string, string> = {
  Read:     'var(--accent)',
  Edit:     'var(--warning)',
  Write:    'var(--warning)',
  Bash:     'var(--success)',
  Grep:     'var(--purple)',
  Glob:     'var(--purple)',
  Task:     'var(--purple)',
  Agent:    'var(--purple)',
  Subagent: 'var(--purple)',
  task:     'var(--purple)',
  agent:    'var(--purple)',
  subagent: 'var(--purple)',
};

export function timelineColor(toolName: string): string {
  return TOOL_TIMELINE_COLOR[toolName] ?? 'var(--text-faint)';
}

export function formatDurationShort(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

/** Legend items for timeline display. */
export const LEGEND_ITEMS = [
  { label: 'Read', color: 'var(--accent)' },
  { label: 'Write/Edit', color: 'var(--warning)' },
  { label: 'Bash', color: 'var(--success)' },
  { label: 'Agent/Task', color: 'var(--purple)' },
  { label: 'Other', color: 'var(--text-faint)' },
] as const;
