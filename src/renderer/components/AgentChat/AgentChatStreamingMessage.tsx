import React, { useEffect, useState } from 'react';
import { AgentChatToolCard, ChevronIcon } from './AgentChatToolCard';
import { AgentChatThinkingBlock } from './AgentChatThinkingBlock';
import { MessageMarkdown } from './MessageMarkdown';
import type { AssistantTurnBlock } from './useAgentChatStreaming';

export interface AgentChatStreamingMessageProps {
  blocks: AssistantTurnBlock[];
  isStreaming: boolean;
  activeTextContent: string;
}

/**
 * Animates text in at ~900 chars/sec using requestAnimationFrame.
 *
 * Claude Code's stream-json format emits one complete assistant message per
 * turn (not token-by-token), so the full response text arrives in a single
 * chunk. This hook makes it feel progressive rather than a sudden block.
 *
 * For real multi-delta streaming (e.g. future API integration), small deltas
 * appear instantly because the animation catches up within a single frame.
 */
function useTypewriter(text: string, charsPerFrame = 15): string {
  const [pos, setPos] = useState(0);

  // Reset position when text is cleared (streaming session ended or restarted)
  useEffect(() => {
    if (!text) setPos(0);
  }, [text]);

  // Advance animation toward the full text length each frame
  useEffect(() => {
    if (pos >= text.length) return;
    const id = requestAnimationFrame(() => {
      setPos((p) => Math.min(p + charsPerFrame, text.length));
    });
    return () => cancelAnimationFrame(id);
  }, [pos, text.length, charsPerFrame]);

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

/* ---------- Tool group (collapsible run of consecutive tool blocks) ---------- */

interface ToolGroupProps {
  tools: AssistantTurnBlock[];
  defaultExpanded: boolean;
}

function ToolGroup({ tools, defaultExpanded }: ToolGroupProps): React.ReactElement {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const allComplete = tools.every((b) => b.kind === 'tool_use' && b.tool.status === 'complete');
  const label = `${tools.length} tool${tools.length === 1 ? '' : 's'}`;

  return (
    <div className="my-1 rounded-md" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1 text-xs text-left transition-colors duration-100 hover:opacity-80"
        style={{ color: 'var(--text-muted)' }}
      >
        <ChevronIcon collapsed={!expanded} />
        <span>{allComplete ? `Used ${label}` : `Using ${label}...`}</span>
      </button>
      {expanded && (
        <div className="space-y-1 px-1 pb-1">
          {tools.map(
            (b) =>
              b.kind === 'tool_use' && (
                <AgentChatToolCard
                  key={b.blockId}
                  name={b.tool.name}
                  status={b.tool.status}
                  filePath={b.tool.filePath}
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
  const displayedLastText = useTypewriter(lastTextContent);
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
      <div
        key={`text-${blockIndex}`}
        className="rounded-lg rounded-tl-sm px-3.5 py-2.5"
        style={{ borderLeft: '2px solid var(--accent)' }}
      >
        <MessageMarkdown content={content} isStreaming={isLast && isStreaming} />
        {isLast && showCursor && <BlinkingCursor />}
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] w-full">
        {/* Avatar + timestamp header */}
        <div className="flex items-center gap-2 mb-1">
          <div
            className="h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--bg)' }}
          >
            C
          </div>
          <span className="text-[11px] text-[var(--text-muted)]">now</span>
        </div>

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
              />
            );
          })}

          {/* Show blinking cursor when streaming starts and no blocks yet */}
          {blocks.length === 0 && isStreaming && (
            <div
              className="rounded-lg rounded-tl-sm px-3.5 py-2.5"
              style={{ borderLeft: '2px solid var(--accent)' }}
            >
              <div className="text-sm leading-relaxed text-[var(--text-muted)]">
                <BlinkingCursor />
              </div>
            </div>
          )}
        </div>
      </div>
      <style>{`
        @keyframes agentChatCursorBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
