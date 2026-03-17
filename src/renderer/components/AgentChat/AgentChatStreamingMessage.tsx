import React, { useEffect, useRef, useState } from 'react';
import { AgentChatToolCard, ChevronIcon } from './AgentChatToolCard';
import { AgentChatThinkingBlock } from './AgentChatThinkingBlock';
import { StreamingChangeSummaryBar as ImportedStreamingChangeSummaryBar } from './ChangeSummaryBar';
import { MessageMarkdown } from './MessageMarkdown';

// Guard: Vite HMR can sometimes fail to resolve newly-created modules, leaving
// the import as `undefined`. Render nothing instead of crashing the entire app.
const StreamingChangeSummaryBar = ImportedStreamingChangeSummaryBar ?? (() => null);
import type { AssistantTurnBlock } from './useAgentChatStreaming';

/* ---------- Rotating status messages ---------- */

const OUROBOROS_MESSAGES = [
  'Slithering...',
  'Coiling...',
  'Uncoiling...',
  'Winding...',
  'Shedding...',
  'Striking...',
  'Constricting...',
  'Digesting...',
  'Consuming...',
  'Cycling...',
  'Turning...',
  'Devouring...',
  'Reforming...',
  'Swallowing...',
  'Weaving...',
  'Forming...',
  'Tracing...',
  'Spiraling...',
  'Circling...',
  'Coalescing...',
  'Unwinding...',
];

function pickNextIndex(prev: number, visited: Set<number>): number {
  if (visited.size >= OUROBOROS_MESSAGES.length) visited.clear();
  let next: number;
  do {
    next = Math.floor(Math.random() * OUROBOROS_MESSAGES.length);
  } while (next === prev || visited.has(next));
  visited.add(next);
  return next;
}

function StreamingStatusMessage({ onStop }: { onStop?: () => Promise<void> }): React.ReactElement {
  const [msgIndex, setMsgIndex] = useState(() => Math.floor(Math.random() * OUROBOROS_MESSAGES.length));
  const [displayChars, setDisplayChars] = useState(0);
  const [showSnake, setShowSnake] = useState(false);
  const visitedRef = useRef(new Set<number>([msgIndex]));

  const message = OUROBOROS_MESSAGES[msgIndex];

  // Typewriter: advance one character every 38ms until word is fully revealed
  useEffect(() => {
    if (displayChars >= message.length) return;
    const id = setTimeout(() => setDisplayChars((c) => c + 1), 38);
    return () => clearTimeout(id);
  }, [displayChars, message.length]);

  // Once word is fully typed: show snake, then cycle to the next word
  useEffect(() => {
    if (displayChars < message.length) return;

    // Brief pause, then snake starts growing
    const snakeId = setTimeout(() => setShowSnake(true), 120);

    // After snake grows + hold time, advance to next word
    // 120ms pause + 1400ms grow + 700ms hold ≈ 2.2s before next cycle
    const cycleId = setTimeout(() => {
      setMsgIndex((prev) => pickNextIndex(prev, visitedRef.current));
      setDisplayChars(0);
      setShowSnake(false);
    }, 120 + 1400 + 700);

    return () => {
      clearTimeout(snakeId);
      clearTimeout(cycleId);
    };
  }, [displayChars, message.length]);

  return (
    <div className="pl-7 py-0.5 flex items-center justify-between pr-1">
      <div className="flex items-center gap-1.5">
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {message.slice(0, displayChars)}
          {displayChars < message.length && <BlinkingCursor />}
        </span>
        {showSnake && <SlitherSnake key={msgIndex} />}
      </div>
      {onStop && (
        <button
          onClick={() => void onStop()}
          title="Stop task"
          className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] transition-colors duration-100 hover:bg-[var(--bg-tertiary)]"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--error, #f85149)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
            <rect x="4" y="4" width="16" height="16" rx="2" />
          </svg>
          Stop
        </button>
      )}
    </div>
  );
}

export interface AgentChatStreamingMessageProps {
  blocks: AssistantTurnBlock[];
  isStreaming: boolean;
  activeTextContent: string;
  onStop?: () => Promise<void>;
}

/**
 * Animates text in at ~2700 chars/sec using requestAnimationFrame.
 *
 * Tracks the previous text length so that when new content arrives, only
 * the *delta* is animated — previously-displayed text stays visible
 * instantly. This prevents the "cutoff" effect where large chunks appear
 * to truncate the response while the typewriter catches up.
 *
 * When isStreaming=false (model has finished), the animation jumps to end
 * immediately so there's no artificial delay after the model is done.
 */
function useTypewriter(text: string, isStreaming: boolean, charsPerFrame = 45): string {
  const [pos, setPos] = useState(0);
  const prevLengthRef = useRef(0);

  // Reset position when text is cleared (streaming session ended or restarted)
  useEffect(() => {
    if (!text) {
      setPos(0);
      prevLengthRef.current = 0;
    }
  }, [text]);

  // When text grows, jump pos to the previously-displayed length so old
  // content stays visible and only the new delta animates in.
  useEffect(() => {
    if (text.length > prevLengthRef.current) {
      setPos((p) => Math.max(p, prevLengthRef.current));
    }
  }, [text.length]);

  // Jump to end immediately when the model stops streaming
  useEffect(() => {
    if (!isStreaming && pos < text.length) {
      setPos(text.length);
      prevLengthRef.current = text.length;
    }
  }, [isStreaming, pos, text.length]);

  // Advance animation toward the full text length each frame (while streaming)
  useEffect(() => {
    if (!isStreaming || pos >= text.length) return;
    const id = requestAnimationFrame(() => {
      setPos((p) => {
        const next = Math.min(p + charsPerFrame, text.length);
        prevLengthRef.current = next;
        return next;
      });
    });
    return () => cancelAnimationFrame(id);
  }, [isStreaming, pos, text.length, charsPerFrame]);

  return text.slice(0, pos);
}

function BlinkingCursor(): React.ReactElement {
  return (
    <span
      className="ml-0.5 inline-block h-[1.1em] w-[2px] align-text-bottom"
      style={{
        backgroundColor: 'var(--accent)',
        animation: 'agentChatCursorBlink 1s step-end infinite',
      }}
    />
  );
}

function SlitherSnake(): React.ReactElement {
  return (
    <span
      className="inline-flex items-center ml-1.5"
      style={{ animation: 'snakeSway 3.5s ease-in-out infinite' }}
    >
      <span style={{
        display: 'inline-block',
        overflow: 'hidden',
        animation: 'snakeGrow 1.4s ease-out forwards',
      }}>
        <svg width="26" height="14" viewBox="0 0 26 14" fill="none" style={{ overflow: 'visible' }}>
          {/* Wavy body with flowing segments */}
          <path
            d="M1 7 C4 2, 7 2, 10 7 C13 12, 16 12, 19 7"
            stroke="var(--accent)"
            strokeWidth="1.6"
            strokeLinecap="round"
            fill="none"
            strokeDasharray="3 2"
            style={{ animation: 'snakeFlow 1.2s linear infinite' }}
          />
          {/* Head */}
          <ellipse cx="21" cy="6.5" rx="2.2" ry="2" fill="var(--accent)" />
          {/* Eye */}
          <circle cx="21.5" cy="5.8" r="0.6" fill="var(--bg, #1a1a2e)" />
          {/* Forked tongue */}
          <g style={{ animation: 'snakeTongue 2s ease-in-out infinite' }}>
            <path d="M23 6.5 L24.5 5.5" stroke="var(--error, #f85149)" strokeWidth="0.5" strokeLinecap="round" />
            <path d="M23 6.5 L24.5 7.5" stroke="var(--error, #f85149)" strokeWidth="0.5" strokeLinecap="round" />
          </g>
        </svg>
      </span>
    </span>
  );
}

/* ---------- Tool group (collapsible run of consecutive tool blocks) ---------- */

interface ToolGroupProps {
  tools: AssistantTurnBlock[];
  defaultExpanded: boolean;
}

const TOOL_CATEGORIES: Record<string, Set<string>> = {
  read: new Set(['Read', 'read_file']),
  edit: new Set(['Edit', 'edit_file', 'MultiEdit', 'multi_edit', 'Write', 'write_file', 'create_file', 'NotebookEdit']),
  search: new Set(['Grep', 'search_files', 'Glob', 'find_files']),
  bash: new Set(['Bash', 'execute_command']),
  agent: new Set(['Agent', 'Task']),
};

function categorizeTools(tools: AssistantTurnBlock[]): string {
  const counts: Record<string, number> = {};
  for (const t of tools) {
    if (t.kind !== 'tool_use') continue;
    let cat = 'other';
    for (const [key, names] of Object.entries(TOOL_CATEGORIES)) {
      if (names.has(t.tool.name)) { cat = key; break; }
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
  const completeCount = tools.filter((b) => b.kind === 'tool_use' && b.tool.status === 'complete').length;
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
                  name={b.tool.name}
                  status={b.tool.status}
                  filePath={b.tool.filePath}
                  inputSummary={b.tool.inputSummary}
                  editSummary={b.tool.editSummary}
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
  block: AssistantTurnBlock & { kind: 'thinking' };
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
    | { type: 'text'; block: AssistantTurnBlock; index: number }
    | { type: 'thinking'; block: AssistantTurnBlock & { kind: 'thinking' }; index: number }
    | { type: 'tool'; block: AssistantTurnBlock; index: number }
    | { type: 'tool-group'; tools: AssistantTurnBlock[]; startIndex: number };

  const renderItems: RenderItem[] = [];
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    if (block.kind === 'text') {
      renderItems.push({ type: 'text', block, index: i });
      i++;
    } else if (block.kind === 'thinking') {
      renderItems.push({ type: 'thinking', block: block as AssistantTurnBlock & { kind: 'thinking' }, index: i });
      i++;
    } else {
      // Collect consecutive tool_use blocks
      const run: AssistantTurnBlock[] = [];
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

  function renderTextBlock(block: AssistantTurnBlock & { kind: 'text' }, blockIndex: number): React.ReactElement {
    const isLast = blockIndex === lastTextIndex;
    const content = isLast ? displayedLastText : block.content;

    return (
      <div key={`text-${blockIndex}`} className="pl-7 pb-0.5">
        <MessageMarkdown content={content} isStreaming={isLast && isStreaming} />
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
              return renderTextBlock(item.block as AssistantTurnBlock & { kind: 'text' }, item.index);
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
                (b) => b.kind === 'tool_use' && b.tool.status === 'running',
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
            const toolBlock = item.block as AssistantTurnBlock & { kind: 'tool_use' };
            return (
              <AgentChatToolCard
                key={toolBlock.blockId}
                name={toolBlock.tool.name}
                status={toolBlock.tool.status}
                filePath={toolBlock.tool.filePath}
                inputSummary={toolBlock.tool.inputSummary}
                editSummary={toolBlock.tool.editSummary}
              />
            );
          })}

          {/* Live diff tally — shows file change stats during streaming */}
          <StreamingChangeSummaryBar blocks={blocks} isStreaming={isStreaming} />

          {/* Rotating status message when streaming starts and no blocks yet */}
          {blocks.length === 0 && isStreaming && <StreamingStatusMessage onStop={onStop} />}

          {/* Persistent stop button — visible whenever actively streaming with content */}
          {blocks.length > 0 && isStreaming && onStop && (
            <div className="flex items-center justify-between pl-7 pr-1 pt-1">
              <div className="flex items-center gap-1.5">
                {[0, 150, 300].map((delay, di) => (
                  <span
                    key={di}
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{
                      backgroundColor: 'var(--accent)',
                      opacity: 0.6,
                      animation: `agent-chat-dot-bounce 1.2s ease-in-out ${delay}ms infinite`,
                    }}
                  />
                ))}
              </div>
              <button
                onClick={() => void onStop()}
                title="Stop task"
                className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] transition-colors duration-100 hover:bg-[var(--bg-tertiary)]"
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--error, #f85149)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                </svg>
                Stop
              </button>
            </div>
          )}
        </div>
      </div>
      <style>{`
        @keyframes agentChatCursorBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes snakeFlow {
          from { stroke-dashoffset: 0; }
          to { stroke-dashoffset: -10; }
        }
        @keyframes snakeTongue {
          0%, 50%, 100% { opacity: 0; }
          60%, 80% { opacity: 1; }
        }
        @keyframes snakeGrow {
          from { width: 0px; }
          to { width: 28px; }
        }
        @keyframes snakeSway {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(3px); }
        }
        @keyframes agent-chat-dot-bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-4px); }
        }
      `}</style>
    </div>
  );
}
