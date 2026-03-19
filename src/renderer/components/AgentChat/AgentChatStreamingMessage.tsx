import React, { useEffect, useState } from 'react';

import { AgentChatThinkingBlock } from './AgentChatThinkingBlock';
import { AgentChatToolCard, ChevronIcon } from './AgentChatToolCard';
import { StreamingChangeSummaryBar as ImportedStreamingChangeSummaryBar } from './ChangeSummaryBar';
import { MessageMarkdown } from './MessageMarkdown';
import {
  BlinkingCursor,
  StreamingStatusMessage,
  useTypewriter,
} from './streamingUtils';

// Guard: Vite HMR can sometimes fail to resolve newly-created modules, leaving
// the import as `undefined`. Render nothing instead of crashing the entire app.
const StreamingChangeSummaryBar = ImportedStreamingChangeSummaryBar ?? (() => null);
import type { AgentChatContentBlock } from '../../types/electron-agent-chat';

export interface AgentChatStreamingMessageProps {
  blocks: AgentChatContentBlock[];
  isStreaming: boolean;
  activeTextContent: string;
  onStop?: () => Promise<void>;
}

/* ---------- Tool group (collapsible run of consecutive tool blocks) ---------- */

interface ToolGroupProps {
  tools: AgentChatContentBlock[];
  defaultExpanded: boolean;
}

const TOOL_CATEGORIES: Record<string, Set<string>> = {
  read: new Set(['Read', 'read_file']),
  edit: new Set(['Edit', 'edit_file', 'MultiEdit', 'multi_edit', 'Write', 'write_file', 'create_file', 'NotebookEdit']),
  search: new Set(['Grep', 'search_files', 'Glob', 'find_files']),
  bash: new Set(['Bash', 'execute_command']),
  agent: new Set(['Agent', 'Task']),
};

function categorizeTools(tools: AgentChatContentBlock[]): string {
  const counts: Record<string, number> = {};
  for (const t of tools) {
    if (t.kind !== 'tool_use') continue;
    let cat = 'other';
    for (const [key, names] of Object.entries(TOOL_CATEGORIES)) {
      if (names.has(t.tool)) { cat = key; break; }
    }
    counts[cat] = (counts[cat] ?? 0) + 1;
  }
  const parts: string[] = [];
  if (counts.read) parts.push(`Read ${counts.read} file${counts.read === 1 ? '' : 's'}`);
  if (counts.edit) parts.push(`Edited ${counts.edit} file${counts.edit === 1 ? '' : 's'}`);
  if (counts.search) parts.push(`${counts.search} search${counts.search === 1 ? '' : 'es'}`);
  if (counts.bash) parts.push(`${counts.bash} command${counts.bash === 1 ? '' : 's'}`);
  if (counts.agent) parts.push(`${counts.agent} agent${counts.agent === 1 ? '' : 's'}`);
  if (counts.other) parts.push(`${counts.other} other`);
  return parts.join(', ');
}

function ToolGroup({ tools, defaultExpanded }: ToolGroupProps): React.ReactElement {
  const [expanded, setExpanded] = useState(defaultExpanded);

  useEffect(() => {
    if (!defaultExpanded) {
      setExpanded(false);
    }
  }, [defaultExpanded]);
  const completeCount = tools.filter((b) => b.kind === 'tool_use' && b.status === 'complete').length;
  const allComplete = completeCount === tools.length;
  const summary = categorizeTools(tools);

  return (
    <div className="my-1 rounded-md border" style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border)' }}>
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-xs text-left transition-colors duration-100 hover:opacity-80"
      >
        <ChevronIcon collapsed={!expanded} />
        {!allComplete ? (
          <svg className="h-3.5 w-3.5 animate-spin shrink-0" viewBox="0 0 16 16" fill="none" style={{ color: 'var(--accent)' }}>
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="32" strokeDashoffset="8" strokeLinecap="round" />
          </svg>
        ) : (
          <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="none" style={{ color: 'var(--accent)' }}>
            <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        <span className="truncate" style={{ color: 'var(--text-muted)' }}>{summary}</span>
        <span className="ml-auto shrink-0 text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {allComplete ? `${tools.length} tools` : `${completeCount}/${tools.length}`}
        </span>
      </button>
      {expanded && (
        <div className="space-y-1 border-t px-1.5 pb-1.5 pt-1" style={{ borderColor: 'var(--border)' }}>
          {tools.map(
            (b) =>
              b.kind === 'tool_use' && (
                <AgentChatToolCard
                  key={b.blockId}
                  name={b.tool}
                  status={b.status}
                  filePath={b.filePath}
                  inputSummary={b.inputSummary}
                  editSummary={b.editSummary}
                />
              ),
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Thinking block state management for streaming ---------- */

function StreamingThinkingBlock({
  block,
  isLast,
  isStreaming,
}: {
  block: AgentChatContentBlock & { kind: 'thinking' };
  isLast: boolean;
  isStreaming: boolean;
}): React.ReactElement {
  const [collapsed, setCollapsed] = useState(false);
  const isActivelyStreaming = isStreaming && isLast && block.duration === undefined;

  // Auto-collapse when thinking completes
  useEffect(() => {
    if (block.duration !== undefined && !isActivelyStreaming) {
      setCollapsed(true);
    }
  }, [block.duration, isActivelyStreaming]);

  return (
    <AgentChatThinkingBlock
      content={block.content}
      duration={block.duration}
      isStreaming={isActivelyStreaming}
      collapsed={collapsed}
      onToggleCollapse={() => setCollapsed((c) => !c)}
    />
  );
}

/* ---------- Main component ---------- */

export function AgentChatStreamingMessage({
  blocks,
  isStreaming,
  onStop,
}: AgentChatStreamingMessageProps): React.ReactElement {
  // Find the last text block index for typewriter targeting
  let lastTextIndex = -1;
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i].kind === 'text') {
      lastTextIndex = i;
      break;
    }
  }

  // The typewriter animates only the LAST text block's content
  const lastTextContent = lastTextIndex >= 0 ? (blocks[lastTextIndex] as { kind: 'text'; content: string }).content : '';
  const displayedLastText = useTypewriter(lastTextContent, isStreaming);
  const showCursor = isStreaming || (lastTextContent.length > 0 && displayedLastText.length < lastTextContent.length);

  // Group consecutive tool_use blocks together
  type RenderItem =
    | { type: 'text'; block: AgentChatContentBlock; index: number }
    | { type: 'thinking'; block: AgentChatContentBlock & { kind: 'thinking' }; index: number }
    | { type: 'tool'; block: AgentChatContentBlock; index: number }
    | { type: 'tool-group'; tools: AgentChatContentBlock[]; startIndex: number };

  const renderItems: RenderItem[] = [];
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    if (block.kind === 'text') {
      renderItems.push({ type: 'text', block, index: i });
      i++;
    } else if (block.kind === 'thinking') {
      renderItems.push({ type: 'thinking', block: block as AgentChatContentBlock & { kind: 'thinking' }, index: i });
      i++;
    } else {
      // Collect consecutive tool_use blocks
      const run: AgentChatContentBlock[] = [];
      const startIdx = i;
      while (i < blocks.length && blocks[i].kind === 'tool_use') {
        run.push(blocks[i]);
        i++;
      }
      if (run.length >= 2) {
        renderItems.push({ type: 'tool-group', tools: run, startIndex: startIdx });
      } else {
        renderItems.push({ type: 'tool', block: run[0], index: startIdx });
      }
    }
  }

  function renderTextBlock(block: AgentChatContentBlock & { kind: 'text' }, blockIndex: number): React.ReactElement {
    const isLast = blockIndex === lastTextIndex;
    const content = isLast ? displayedLastText : block.content;

    return (
      <div key={`text-${blockIndex}`} className="pl-7 pb-0.5">
        <MessageMarkdown content={content} />
        {isLast && showCursor && <BlinkingCursor />}
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[95%]">
        {/* Blocks rendered in sequence */}
        <div className="space-y-2">
          {renderItems.map((item) => {
            if (item.type === 'text') {
              return renderTextBlock(item.block as AgentChatContentBlock & { kind: 'text' }, item.index);
            }

            if (item.type === 'thinking') {
              return (
                <StreamingThinkingBlock
                  key={`thinking-${item.index}`}
                  block={item.block}
                  isLast={item.index === blocks.length - 1}
                  isStreaming={isStreaming}
                />
              );
            }

            if (item.type === 'tool-group') {
              const anyRunning = item.tools.some(
                (b) => b.kind === 'tool_use' && b.status === 'running',
              );
              return (
                <ToolGroup
                  key={`tool-group-${item.startIndex}`}
                  tools={item.tools}
                  defaultExpanded={anyRunning}
                />
              );
            }

            // Single tool block
            const toolBlock = item.block as AgentChatContentBlock & { kind: 'tool_use' };
            return (
              <AgentChatToolCard
                key={toolBlock.blockId}
                name={toolBlock.tool}
                status={toolBlock.status}
                filePath={toolBlock.filePath}
                inputSummary={toolBlock.inputSummary}
                editSummary={toolBlock.editSummary}
              />
            );
          })}

          {/* Live diff tally — shows file change stats during streaming */}
          <StreamingChangeSummaryBar blocks={blocks} isStreaming={isStreaming} />

          {/* Rotating status text + animated snake — shown throughout streaming */}
          {isStreaming && <StreamingStatusMessage onStop={onStop} />}
        </div>
      </div>
    </div>
  );
}
