import React, { useEffect, useMemo, useState } from 'react';

import type { AgentChatContentBlock } from '../../types/electron';
import { AgentChatToolCard, ChevronIcon } from './AgentChatToolCard';

export interface AgentChatToolGroupProps {
  /** Consecutive tool_use blocks to render as a group */
  blocks: Array<AgentChatContentBlock & { kind: 'tool_use' }>;
  /** Start expanded (e.g. when tools are still running during streaming) */
  defaultExpanded?: boolean;
}

/* ---------- Tool type grouping ---------- */

const TOOL_CATEGORIES = [
  { category: 'read', label: (count: number) => `Read ${count} file${count === 1 ? '' : 's'}`, matches: new Set(['Read', 'read_file']) },
  { category: 'edit', label: (count: number) => `Edited ${count} file${count === 1 ? '' : 's'}`, matches: new Set(['Edit', 'edit_file', 'MultiEdit', 'multi_edit', 'Write', 'write_file', 'create_file', 'NotebookEdit']) },
  { category: 'search', label: (count: number) => `${count} search${count === 1 ? '' : 'es'}`, matches: new Set(['Grep', 'search_files', 'Glob', 'find_files']) },
  { category: 'bash', label: (count: number) => `${count} command${count === 1 ? '' : 's'}`, matches: new Set(['Bash', 'execute_command']) },
] as const;

function summarizeToolTypes(blocks: Array<AgentChatContentBlock & { kind: 'tool_use' }>): string {
  const counts = new Map<string, number>([...TOOL_CATEGORIES.map((entry): [string, number] => [entry.category, 0]), ['other', 0]]);
  for (const block of blocks) {
    const category = TOOL_CATEGORIES.find((entry) => entry.matches.has(block.tool))?.category ?? 'other';
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return TOOL_CATEGORIES.map((entry) => {
    const count = counts.get(entry.category) ?? 0;
    return count ? entry.label(count) : null;
  }).concat((counts.get('other') ?? 0) ? `${counts.get('other')} other tool${(counts.get('other') ?? 0) === 1 ? '' : 's'}` : null).filter(Boolean).join(', ');
}

/**
 * Groups consecutive tool_use blocks into a collapsible group with a summary line.
 *
 * Shows "Read 3 files, Edited 2 files" etc. with expand/collapse chevron.
 * Individual tool cards render inside the expanded group.
 */
export const AgentChatToolGroup = React.memo(function AgentChatToolGroup({ blocks, defaultExpanded }: AgentChatToolGroupProps): React.ReactElement {
  const [expanded, setExpanded] = useState(defaultExpanded ?? blocks.some((b) => b.status === 'running'));

  useEffect(() => {
    if (!defaultExpanded) {
      setExpanded(false);
    }
  }, [defaultExpanded]);

  const summaryText = useMemo(() => summarizeToolTypes(blocks), [blocks]);
  const allComplete = blocks.every((b) => b.status === 'complete');

  return (
    <div className="my-1.5 rounded-md border border-border-semantic bg-surface-raised">
      <ToolGroupHeader expanded={expanded} allComplete={allComplete} summaryText={summaryText} count={blocks.length} onToggle={() => setExpanded((e) => !e)} />
      <div className="agent-chat-tool-expand" data-collapsed={expanded ? 'false' : 'true'}>
        <div className="space-y-1 border-t border-border-semantic px-1.5 py-1.5">
          {blocks.map((block, idx) => (
            <AgentChatToolCard
              key={block.blockId ?? `tool-group-${idx}`}
              name={block.tool}
              status={block.status === 'error' ? 'complete' : block.status}
              filePath={block.filePath}
              input={block.input}
              duration={block.duration}
              inputSummary={block.inputSummary}
              editSummary={block.editSummary}
              errorOutput={block.status === 'error' ? block.output : undefined}
              toolOutput={block.status !== 'error' ? block.output : undefined}
              subTools={block.subTools}
            />
          ))}
        </div>
      </div>
    </div>
  );
});

function ToolGroupHeader({
  expanded,
  allComplete,
  summaryText,
  count,
  onToggle,
}: {
  expanded: boolean;
  allComplete: boolean;
  summaryText: string;
  count: number;
  onToggle: () => void;
}): React.ReactElement {
  return (
    <button onClick={onToggle} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors duration-100 hover:opacity-80">
      <ChevronIcon collapsed={!expanded} />
      {!allComplete ? (
        <svg className="h-3.5 w-3.5 animate-spin shrink-0 text-interactive-accent" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="32" strokeDashoffset="8" strokeLinecap="round" />
        </svg>
      ) : (
        <svg className="h-3.5 w-3.5 shrink-0 text-interactive-accent" viewBox="0 0 16 16" fill="none">
          <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      <span className="truncate text-text-semantic-muted">{summaryText}</span>
      <span className="ml-auto text-[10px] text-text-semantic-muted">{count} tool{count === 1 ? '' : 's'}</span>
    </button>
  );
}
