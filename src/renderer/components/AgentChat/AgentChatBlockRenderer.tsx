import React, { useState } from 'react';
import type { AgentChatContentBlock } from '../../types/electron';
import { AgentChatPlanBlock } from './AgentChatPlanBlock';
import { AgentChatThinkingBlock } from './AgentChatThinkingBlock';
import { AgentChatToolCard } from './AgentChatToolCard';
import { AgentChatToolGroup } from './AgentChatToolGroup';
import { ChatCodeBlock } from './ChatCodeBlock';
import { MessageMarkdown } from './MessageMarkdown';

export interface AgentChatBlockRendererProps {
  block: AgentChatContentBlock;
  /** Index within the parent message's blocks array, used for keying */
  index: number;
  /** Whether this block is currently being streamed */
  isStreaming: boolean;
  /** Whether this is the last block in the message (for streaming cursor) */
  isLastBlock: boolean;
  /**
   * All blocks in the parent message. When provided, the renderer can detect
   * consecutive tool_use blocks and group them. Optional for backward compat.
   */
  allBlocks?: AgentChatContentBlock[];
  /**
   * When true, this block is part of a tool group and should skip its own
   * rendering (the group wrapper handles it). Set by the parent loop.
   */
  skipRender?: boolean;
}

/* ---------- Code block — delegates to ChatCodeBlock ---------- */

function CodeBlockRenderer({ block }: { block: AgentChatContentBlock & { kind: 'code' } }): React.ReactElement {
  return (
    <ChatCodeBlock
      code={block.content}
      language={block.language}
      filePath={block.filePath}
      showApply={!block.applied}
    />
  );
}

/* ---------- Error block ---------- */

function ErrorBlockRenderer({ block }: { block: AgentChatContentBlock & { kind: 'error' } }): React.ReactElement {
  return (
    <div
      className="my-1.5 rounded-md border px-3 py-2 text-xs"
      style={{
        borderColor: 'rgba(248, 81, 73, 0.3)',
        backgroundColor: 'rgba(248, 81, 73, 0.06)',
        color: 'var(--error, #f85149)',
      }}
    >
      <div className="flex items-center gap-1.5">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <span className="font-medium">{block.code}</span>
      </div>
      <div className="mt-1">{block.message}</div>
      {block.recoverable && (
        <div className="mt-1 text-[10px] opacity-70">This error may be recoverable. Try again.</div>
      )}
    </div>
  );
}

/* ---------- Diff block (placeholder — Phase 2 will enhance) ---------- */

function DiffBlockRenderer({ block }: { block: AgentChatContentBlock & { kind: 'diff' } }): React.ReactElement {
  return (
    <div
      className="my-1.5 rounded-md border px-3 py-2 text-xs"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-tertiary)' }}
    >
      <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v18M3 12h18" />
        </svg>
        <span className="font-medium text-[var(--text)]">{block.filePath}</span>
        <span
          className="ml-auto rounded-full px-1.5 py-0.5 text-[10px]"
          style={{
            backgroundColor: block.status === 'accepted' ? 'rgba(63, 185, 80, 0.15)' : block.status === 'rejected' ? 'rgba(248, 81, 73, 0.15)' : 'var(--bg)',
            color: block.status === 'accepted' ? '#3fb950' : block.status === 'rejected' ? '#f85149' : 'var(--text-muted)',
          }}
        >
          {block.status}
        </span>
      </div>
      <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap text-[11px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
        {block.hunks}
      </pre>
    </div>
  );
}

/* ---------- Plan block (Phase 3 — interactive checklist) ---------- */
/* Uses the standalone AgentChatPlanBlock component */

/* ---------- Unknown block (debug fallback) ---------- */

function UnknownBlockRenderer({ block }: { block: AgentChatContentBlock }): React.ReactElement {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="my-1.5 rounded-md border px-3 py-2 text-xs"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-tertiary)' }}
    >
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center gap-1.5 text-[var(--text-muted)] hover:opacity-80"
      >
        <span>Unknown block: {(block as { kind: string }).kind}</span>
      </button>
      {expanded && (
        <pre className="mt-1.5 max-h-[200px] overflow-auto whitespace-pre-wrap text-[10px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
          {JSON.stringify(block, null, 2)}
        </pre>
      )}
    </div>
  );
}

/* ---------- Main dispatcher ---------- */

/**
 * Collects a run of consecutive tool_use blocks starting at `startIndex`.
 * Returns the blocks in the run, stopping at the first non-tool_use block.
 */
function collectToolRun(
  allBlocks: AgentChatContentBlock[],
  startIndex: number,
): Array<AgentChatContentBlock & { kind: 'tool_use' }> {
  const run: Array<AgentChatContentBlock & { kind: 'tool_use' }> = [];
  for (let i = startIndex; i < allBlocks.length; i++) {
    if (allBlocks[i].kind === 'tool_use') {
      run.push(allBlocks[i] as AgentChatContentBlock & { kind: 'tool_use' });
    } else {
      break;
    }
  }
  return run;
}

/**
 * Renders a single content block by dispatching on its `kind`.
 *
 * Each block kind maps to a dedicated renderer component. Unknown kinds
 * fall back to a collapsed JSON debug view for forward compatibility.
 *
 * When `allBlocks` is provided, consecutive tool_use blocks are grouped
 * into an `AgentChatToolGroup`. The first block in a run renders the group;
 * subsequent blocks in the run set `skipRender` to avoid duplication.
 */
export function AgentChatBlockRenderer({
  block,
  index,
  isStreaming,
  isLastBlock,
  allBlocks,
  skipRender,
}: AgentChatBlockRendererProps): React.ReactElement {
  const [thinkingCollapsed, setThinkingCollapsed] = useState(!isStreaming);

  // If this block is part of a tool group that was already rendered, skip it
  if (skipRender) {
    return <></>;
  }

  switch (block.kind) {
    case 'text':
      return <MessageMarkdown content={block.content} isStreaming={isStreaming && isLastBlock} />;

    case 'thinking':
      return (
        <AgentChatThinkingBlock
          content={block.content}
          duration={block.duration}
          isStreaming={isStreaming && isLastBlock}
          collapsed={thinkingCollapsed && !isStreaming}
          onToggleCollapse={() => setThinkingCollapsed((c) => !c)}
        />
      );

    case 'tool_use': {
      // When allBlocks is provided, check if this is the start of a consecutive run
      if (allBlocks) {
        const run = collectToolRun(allBlocks, index);
        if (run.length >= 2) {
          return <AgentChatToolGroup blocks={run} />;
        }
      }

      return (
        <AgentChatToolCard
          name={block.tool}
          status={block.status === 'error' ? 'complete' : block.status}
          filePath={block.filePath}
          input={block.input}
          duration={block.duration}
          errorOutput={block.status === 'error' ? block.output : undefined}
        />
      );
    }

    case 'tool_result':
      // Tool results are typically displayed within the tool_use card
      // Render as muted text for standalone occurrences
      return (
        <div className="my-1 px-2.5 py-1 text-xs text-[var(--text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
          {block.content}
        </div>
      );

    case 'code':
      return <CodeBlockRenderer block={block} />;

    case 'diff':
      return <DiffBlockRenderer block={block} />;

    case 'plan':
      return (
        <AgentChatPlanBlock
          steps={block.steps}
          completedCount={block.completedCount}
          isStreaming={isStreaming && isLastBlock}
        />
      );

    case 'error':
      return <ErrorBlockRenderer block={block} />;

    default:
      return <UnknownBlockRenderer block={block} />;
  }
}
