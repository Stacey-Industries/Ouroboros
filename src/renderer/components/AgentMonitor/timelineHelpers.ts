/**
 * timelineHelpers.ts — Shared helpers for timeline and feed components.
 */

/** Color mapping for tool types in timelines. */
export const TOOL_TIMELINE_COLOR: Record<string, string> = {
  Read: 'var(--interactive-accent)',
  Edit: 'var(--status-warning)',
  Write: 'var(--status-warning)',
  Bash: 'var(--status-success)',
  Grep: 'var(--palette-purple)',
  Glob: 'var(--palette-purple)',
  Task: 'var(--palette-purple)',
  Agent: 'var(--palette-purple)',
  Subagent: 'var(--palette-purple)',
  task: 'var(--palette-purple)',
  agent: 'var(--palette-purple)',
  subagent: 'var(--palette-purple)',
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
  { label: 'Read', color: 'var(--interactive-accent)' },
  { label: 'Write/Edit', color: 'var(--status-warning)' },
  { label: 'Bash', color: 'var(--status-success)' },
  { label: 'Agent/Task', color: 'var(--palette-purple)' },
  { label: 'Other', color: 'var(--text-faint)' },
] as const;
