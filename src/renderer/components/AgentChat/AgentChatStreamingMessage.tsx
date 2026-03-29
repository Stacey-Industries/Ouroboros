import React, { useEffect, useState } from 'react';

import type { AgentChatContentBlock } from '../../types/electron-agent-chat';
import { AgentChatThinkingBlock } from './AgentChatThinkingBlock';
import { AgentChatToolCard, ChevronIcon } from './AgentChatToolCard';
import { StreamingChangeSummaryBar as ImportedStreamingChangeSummaryBar } from './ChangeSummaryBar';
import { MessageMarkdown } from './MessageMarkdown';
import { BlinkingCursor, StreamingStatusMessage, useTypewriter } from './streamingUtils';

const StreamingChangeSummaryBar = ImportedStreamingChangeSummaryBar ?? (() => null);

export interface AgentChatStreamingMessageProps {
  blocks: AgentChatContentBlock[];
  isStreaming: boolean;
  activeTextContent: string;
  onStop?: () => Promise<void>;
}

interface ToolGroupProps {
  tools: Array<AgentChatContentBlock & { kind: 'tool_use' }>;
  defaultExpanded: boolean;
}

const TOOL_SUMMARIES = [
  { category: 'read', label: (count: number) => `Read ${count} file${count === 1 ? '' : 's'}`, names: new Set(['Read', 'read_file']) },
  { category: 'edit', label: (count: number) => `Edited ${count} file${count === 1 ? '' : 's'}`, names: new Set(['Edit', 'edit_file', 'MultiEdit', 'multi_edit', 'Write', 'write_file', 'create_file', 'NotebookEdit']) },
  { category: 'search', label: (count: number) => `${count} search${count === 1 ? '' : 'es'}`, names: new Set(['Grep', 'search_files', 'Glob', 'find_files']) },
  { category: 'bash', label: (count: number) => `${count} command${count === 1 ? '' : 's'}`, names: new Set(['Bash', 'execute_command']) },
  { category: 'agent', label: (count: number) => `${count} agent${count === 1 ? '' : 's'}`, names: new Set(['Agent', 'Task']) },
] as const;

function categorizeTools(tools: Array<AgentChatContentBlock & { kind: 'tool_use' }>): string {
  const counts = new Map<string, number>([...TOOL_SUMMARIES.map((entry): [string, number] => [entry.category, 0]), ['other', 0]]);
  for (const tool of tools) {
    const summary = TOOL_SUMMARIES.find((entry) => entry.names.has(tool.tool));
    counts.set(summary?.category ?? 'other', (counts.get(summary?.category ?? 'other') ?? 0) + 1);
  }
  return TOOL_SUMMARIES.map((entry) => {
    const count = counts.get(entry.category) ?? 0;
    return count ? entry.label(count) : null;
  }).concat((counts.get('other') ?? 0) ? `${counts.get('other')} other` : null).filter(Boolean).join(', ');
}

function ToolGroup({ tools, defaultExpanded }: ToolGroupProps): React.ReactElement<any> {
  const [expanded, setExpanded] = useState(defaultExpanded);

  useEffect(() => {
    if (!defaultExpanded) setExpanded(false);
  }, [defaultExpanded]);

  const completeCount = tools.filter((tool) => tool.status === 'complete').length;
  const allComplete = completeCount === tools.length;
  const summary = categorizeTools(tools);

  return (
    <div className="my-1 rounded-md border border-border-semantic bg-surface-raised">
      <ToolGroupHeader
        expanded={expanded}
        allComplete={allComplete}
        summary={summary}
        completeCount={completeCount}
        totalCount={tools.length}
        onToggle={() => setExpanded((prev) => !prev)}
      />
      {expanded && (
        <div className="space-y-1 border-t border-border-semantic px-1.5 pb-1.5 pt-1">
          {tools.map((tool) => (
            <AgentChatToolCard
              key={tool.blockId}
              name={tool.tool}
              status={tool.status}
              filePath={tool.filePath}
              inputSummary={tool.inputSummary}
              editSummary={tool.editSummary}
              toolOutput={tool.status !== 'error' ? tool.output : undefined}
              subTools={tool.subTools}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ToolGroupHeader({
  expanded,
  allComplete,
  summary,
  completeCount,
  totalCount,
  onToggle,
}: {
  expanded: boolean;
  allComplete: boolean;
  summary: string;
  completeCount: number;
  totalCount: number;
  onToggle: () => void;
}): React.ReactElement<any> {
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
      <span className="truncate text-text-semantic-muted">{summary}</span>
      <span className="ml-auto shrink-0 text-[10px] text-text-semantic-muted">{allComplete ? `${totalCount} tools` : `${completeCount}/${totalCount}`}</span>
    </button>
  );
}

function getLastTextIndex(blocks: AgentChatContentBlock[]): number {
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i].kind === 'text') return i;
  }
  return -1;
}

type RenderItem =
  | { type: 'text'; block: AgentChatContentBlock & { kind: 'text' }; index: number }
  | { type: 'thinking'; block: AgentChatContentBlock & { kind: 'thinking' }; index: number }
  | { type: 'tool'; block: AgentChatContentBlock & { kind: 'tool_use' }; index: number }
  | { type: 'tool-group'; tools: Array<AgentChatContentBlock & { kind: 'tool_use' }>; startIndex: number };

function buildRenderItems(blocks: AgentChatContentBlock[]): RenderItem[] {
  const items: RenderItem[] = [];
  for (let i = 0; i < blocks.length;) {
    const block = blocks[i];
    if (block.kind === 'text') {
      items.push({ type: 'text', block, index: i });
      i++;
      continue;
    }
    if (block.kind === 'thinking') {
      items.push({ type: 'thinking', block, index: i });
      i++;
      continue;
    }

    const run: Array<AgentChatContentBlock & { kind: 'tool_use' }> = [];
    const startIndex = i;
    while (i < blocks.length && blocks[i].kind === 'tool_use') {
      run.push(blocks[i] as AgentChatContentBlock & { kind: 'tool_use' });
      i++;
    }
    items.push(run.length > 1 ? { type: 'tool-group', tools: run, startIndex } : { type: 'tool', block: run[0], index: startIndex });
  }
  return items;
}

function renderTextBlock(content: string, index: number, showCursor: boolean): React.ReactElement<any> {
  return <div key={`text-${index}`} className="pl-7 pb-0.5"><MessageMarkdown content={content} />{showCursor && <BlinkingCursor />}</div>;
}

function StreamingThinkingBlock({
  block,
  isLast,
  isStreaming,
}: {
  block: AgentChatContentBlock & { kind: 'thinking' };
  isLast: boolean;
  isStreaming: boolean;
}): React.ReactElement<any> {
  const [collapsed, setCollapsed] = useState(false);
  const activelyStreaming = isStreaming && isLast && block.duration === undefined;

  useEffect(() => {
    if (block.duration !== undefined && !activelyStreaming) setCollapsed(true);
  }, [activelyStreaming, block.duration]);

  return (
    <AgentChatThinkingBlock
      content={block.content}
      duration={block.duration}
      isStreaming={activelyStreaming}
      collapsed={collapsed}
      onToggleCollapse={() => setCollapsed((prev) => !prev)}
    />
  );
}

export function AgentChatStreamingMessage({
  blocks,
  isStreaming,
  onStop,
}: AgentChatStreamingMessageProps): React.ReactElement<any> {
  const lastTextIndex = getLastTextIndex(blocks);
  const lastTextContent = lastTextIndex >= 0 ? (blocks[lastTextIndex] as { kind: 'text'; content: string }).content : '';
  const displayedLastText = useTypewriter(lastTextContent, isStreaming);
  const showCursor = isStreaming || (lastTextContent.length > 0 && displayedLastText.length < lastTextContent.length);
  const renderItems = buildRenderItems(blocks);

  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[95%]">
        <div className="space-y-2">
          {renderItems.map((item) => {
            if (item.type === 'text') {
              return renderTextBlock(item.index === lastTextIndex ? displayedLastText : item.block.content, item.index, item.index === lastTextIndex && showCursor);
            }
            if (item.type === 'thinking') {
              return <StreamingThinkingBlock key={`thinking-${item.index}`} block={item.block} isLast={item.index === blocks.length - 1} isStreaming={isStreaming} />;
            }
            if (item.type === 'tool-group') {
              return <ToolGroup key={`tool-group-${item.startIndex}`} tools={item.tools} defaultExpanded={item.tools.some((tool) => tool.status === 'running')} />;
            }
            return <AgentChatToolCard key={item.block.blockId} name={item.block.tool} status={item.block.status} filePath={item.block.filePath} inputSummary={item.block.inputSummary} editSummary={item.block.editSummary} toolOutput={item.block.status !== 'error' ? item.block.output : undefined} subTools={item.block.subTools} />;
          })}
          {isStreaming && <StreamingStatusMessage onStop={onStop} />}
          <StreamingChangeSummaryBar blocks={blocks} isStreaming={isStreaming} />
        </div>
      </div>
    </div>
  );
}
