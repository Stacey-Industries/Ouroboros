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

interface ToolTypeSummary {
  category: string;
  count: number;
  label: string;
}

/**
 * Groups tools by semantic category for the summary label.
 * E.g., "Read 3 files, Edited 2 files"
 */
function summarizeToolTypes(blocks: Array<AgentChatContentBlock & { kind: 'tool_use' }>): ToolTypeSummary[] {
  const readTools = new Set(['Read', 'read_file']);
  const editTools = new Set(['Edit', 'edit_file', 'MultiEdit', 'multi_edit', 'Write', 'write_file', 'create_file', 'NotebookEdit']);
  const searchTools = new Set(['Grep', 'search_files', 'Glob', 'find_files']);
  const bashTools = new Set(['Bash', 'execute_command']);

  const counts: Record<string, number> = {
    read: 0,
    edit: 0,
    search: 0,
    bash: 0,
    other: 0,
  };

  for (const b of blocks) {
    if (readTools.has(b.tool)) counts.read++;
    else if (editTools.has(b.tool)) counts.edit++;
    else if (searchTools.has(b.tool)) counts.search++;
    else if (bashTools.has(b.tool)) counts.bash++;
    else counts.other++;
  }

  const summaries: ToolTypeSummary[] = [];
  if (counts.read > 0) summaries.push({ category: 'read', count: counts.read, label: `Read ${counts.read} file${counts.read === 1 ? '' : 's'}` });
  if (counts.edit > 0) summaries.push({ category: 'edit', count: counts.edit, label: `Edited ${counts.edit} file${counts.edit === 1 ? '' : 's'}` });
  if (counts.search > 0) summaries.push({ category: 'search', count: counts.search, label: `${counts.search} search${counts.search === 1 ? '' : 'es'}` });
  if (counts.bash > 0) summaries.push({ category: 'bash', count: counts.bash, label: `${counts.bash} command${counts.bash === 1 ? '' : 's'}` });
  if (counts.other > 0) summaries.push({ category: 'other', count: counts.other, label: `${counts.other} other tool${counts.other === 1 ? '' : 's'}` });

  return summaries;
}

/**
 * Groups consecutive tool_use blocks into a collapsible group with a summary line.
 *
 * Shows "Read 3 files, Edited 2 files" etc. with expand/collapse chevron.
 * Individual tool cards render inside the expanded group.
 */
export const AgentChatToolGroup = React.memo(function AgentChatToolGroup({ blocks, defaultExpanded }: AgentChatToolGroupProps): React.ReactElement {
  const hasRunning = blocks.some((b) => b.status === 'running');
  const [expanded, setExpanded] = useState(defaultExpanded ?? hasRunning);

  useEffect(() => {
    if (!defaultExpanded) {
      setExpanded(false);
    }
  }, [defaultExpanded]);

  const summaries = useMemo(() => summarizeToolTypes(blocks), [blocks]);
  const summaryText = summaries.map((s) => s.label).join(', ');

  const allComplete = blocks.every((b) => b.status === 'complete');

  return (
    <div
      className="my-1.5 rounded-md border"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-tertiary)' }}
    >
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors duration-100 hover:opacity-80"
      >
        <ChevronIcon collapsed={!expanded} />
        {!allComplete && (
          <svg
            className="h-3.5 w-3.5 animate-spin shrink-0"
            viewBox="0 0 16 16"
            fill="none"
            style={{ color: 'var(--accent)' }}
          >
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="32" strokeDashoffset="8" strokeLinecap="round" />
          </svg>
        )}
        {allComplete && (
          <svg
            className="h-3.5 w-3.5 shrink-0"
            viewBox="0 0 16 16"
            fill="none"
            style={{ color: 'var(--accent)' }}
          >
            <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        <span className="truncate" style={{ color: 'var(--text-muted)' }}>
          {summaryText}
        </span>
        <span className="ml-auto text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {blocks.length} tool{blocks.length === 1 ? '' : 's'}
        </span>
      </button>

      <div
        className="agent-chat-tool-expand"
        data-collapsed={expanded ? 'false' : 'true'}
      >
        <div className="space-y-1 border-t px-1.5 py-1.5" style={{ borderColor: 'var(--border)' }}>
          {blocks.map((block, idx) => (
            <AgentChatToolCard
              key={block.blockId ?? `tool-group-${idx}`}
              name={block.tool}
              status={block.status === 'error' ? 'complete' : block.status}
              filePath={block.filePath}
              input={block.input}
              duration={block.duration}
              errorOutput={block.status === 'error' ? block.output : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
});
