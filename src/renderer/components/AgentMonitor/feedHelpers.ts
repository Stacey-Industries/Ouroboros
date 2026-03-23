/**
 * feedHelpers.ts — Shared helpers for ToolCallFeed components.
 */

/** Tool badge colors for the feed view. */
export const TOOL_COLOR: Record<string, string> = {
  Read: 'var(--interactive-accent)',
  Edit: 'var(--status-warning)',
  Write: 'var(--status-warning)',
  Bash: 'var(--status-success)',
  Grep: 'var(--palette-purple)',
  Glob: 'var(--palette-purple)',
};

export function toolColor(toolName: string): string {
  return TOOL_COLOR[toolName] ?? 'var(--text-faint)';
}

export function toolAbbr(toolName: string): string {
  return toolName.slice(0, 2).toUpperCase();
}

export function formatDurationShort(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

const FILE_OP_TOOLS = new Set(['Read', 'Write', 'Edit']);

const VERB_MAP: Record<string, string> = {
  Read: 'Reading',
  Write: 'Writing',
  Edit: 'Editing',
};

export function fileOpLabel(toolName: string, input: string): string | null {
  if (!FILE_OP_TOOLS.has(toolName) || !input) return null;
  const cleaned = input.replace(/\\/g, '/').replace(/^['"]|['"]$/g, '');
  const verb = VERB_MAP[toolName] ?? 'Using';
  return `${verb} ${cleaned}`;
}
