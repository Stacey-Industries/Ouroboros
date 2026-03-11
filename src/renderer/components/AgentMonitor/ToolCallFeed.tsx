/**
 * ToolCallFeed.tsx — Scrollable list of tool calls for an agent session.
 *
 * - Tool badges color-coded by type
 * - Pending calls show a spinner + elapsed time counter
 * - Expandable/collapsible rows showing full tool output
 * - Expand All / Collapse All toggle in feed header
 * - Duration display for completed calls
 * - File path display for file operations (Read, Write, Edit)
 * - Auto-scrolls to the latest entry when new calls arrive
 * - Renders at most the last 50 tool calls (older ones accessible via scroll)
 */

import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import type { ToolCallEvent } from './types';

// ─── Tool badge colors ────────────────────────────────────────────────────────

const TOOL_COLOR: Record<string, string> = {
  Read:  'var(--accent)',
  Edit:  'var(--warning)',
  Write: 'var(--warning)',
  Bash:  'var(--success)',
  Grep:  'var(--purple)',
  Glob:  'var(--purple)',
};

function toolColor(toolName: string): string {
  return TOOL_COLOR[toolName] ?? 'var(--text-faint)';
}

function toolAbbr(toolName: string): string {
  // Use first 2 chars of tool name as abbreviation in badge
  return toolName.slice(0, 2).toUpperCase();
}

function formatDurationShort(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

/** FILE_OP_TOOLS: tools that take a file path as their primary input. */
const FILE_OP_TOOLS = new Set(['Read', 'Write', 'Edit']);

/**
 * For file operation tools, attempt to extract and display just the file path
 * portion of the input string as a short "Reading …" label.
 */
function fileOpLabel(toolName: string, input: string): string | null {
  if (!FILE_OP_TOOLS.has(toolName)) return null;
  if (!input) return null;

  // The input field is already a summarised string (see summarizeToolInput in useAgentEvents).
  // It will typically be the bare file path. Normalize path separators for display.
  const cleaned = input.replace(/\\/g, '/').replace(/^['"]|['"]$/g, '');

  const verb =
    toolName === 'Read' ? 'Reading' :
    toolName === 'Write' ? 'Writing' :
    'Editing';

  return `${verb} ${cleaned}`;
}

// ─── Elapsed seconds hook (for in-progress tool calls) ────────────────────────

function useElapsedSeconds(startMs: number, active: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!active) {
      setElapsed(0);
      return;
    }

    // Seed immediately
    setElapsed(Math.floor((Date.now() - startMs) / 1000));

    intervalRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startMs) / 1000));
    }, 1000);

    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, [startMs, active]);

  return elapsed;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

const SpinnerIcon = memo(function SpinnerIcon(): React.ReactElement {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ animation: 'spin 0.8s linear infinite' }}
    >
      <circle
        cx="6"
        cy="6"
        r="4.5"
        stroke="var(--text-faint)"
        strokeWidth="1.5"
        strokeDasharray="14 8"
        strokeLinecap="round"
      />
    </svg>
  );
});

const SuccessIcon = memo(function SuccessIcon(): React.ReactElement {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M2.5 6L5 8.5L9.5 3.5"
        stroke="var(--success)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
});

const ErrorIcon = memo(function ErrorIcon(): React.ReactElement {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M3 3L9 9M9 3L3 9"
        stroke="var(--error)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
});

const RowChevron = memo(function RowChevron({
  open,
}: {
  open: boolean;
}): React.ReactElement {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{
        transform: open ? 'rotate(90deg)' : 'none',
        transition: 'transform 120ms ease',
        flexShrink: 0,
      }}
    >
      <path
        d="M3 1.5L7 5L3 8.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
});

// ─── Expandable tool call row ────────────────────────────────────────────────

interface ToolCallRowProps {
  call: ToolCallEvent;
  expanded: boolean;
  onToggle: (id: string) => void;
}

const ToolCallRow = memo(function ToolCallRow({
  call,
  expanded,
  onToggle,
}: ToolCallRowProps): React.ReactElement {
  const color = toolColor(call.toolName);
  const hasOutput = call.output !== undefined && call.output.length > 0;
  const isExpandable = hasOutput || call.status !== 'pending';
  const isPending = call.status === 'pending';

  // Elapsed seconds counter — only active while the call is pending
  const elapsedSec = useElapsedSeconds(call.timestamp, isPending);

  // Derive file op label (e.g. "Reading src/main/ipc.ts…")
  const fileLabel = fileOpLabel(call.toolName, call.input);

  const handleClick = useCallback(() => {
    if (isExpandable) {
      onToggle(call.id);
    }
  }, [isExpandable, onToggle, call.id]);

  return (
    <div>
      {/* Row header */}
      <button
        className="w-full flex items-start gap-2 px-3 py-1.5 text-left transition-colors"
        style={{
          minHeight: '28px',
          background: 'transparent',
          cursor: isExpandable ? 'pointer' : 'default',
          border: 'none',
          outline: 'none',
        }}
        onMouseEnter={(e) => {
          if (isExpandable) {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-tertiary)';
          }
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
        }}
        onClick={handleClick}
        aria-expanded={isExpandable ? expanded : undefined}
      >
        {/* Expand chevron */}
        <span
          className="shrink-0 mt-0.5"
          style={{
            color: 'var(--text-faint)',
            opacity: isExpandable ? 1 : 0.3,
            width: '10px',
          }}
        >
          <RowChevron open={expanded} />
        </span>

        {/* Tool badge */}
        <span
          className="shrink-0 mt-0.5 inline-flex items-center justify-center rounded text-[10px] font-bold leading-none"
          style={{
            width: '20px',
            height: '16px',
            color,
            background: `color-mix(in srgb, ${color} 15%, transparent)`,
            border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
          }}
          title={call.toolName}
        >
          {toolAbbr(call.toolName)}
        </span>

        {/* Tool name + input / file op label */}
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <span
            className="text-[11px] font-medium leading-none"
            style={{ color: 'var(--text-muted)' }}
          >
            {call.toolName}
          </span>
          {fileLabel ? (
            <span
              className="text-[11px] leading-snug truncate selectable"
              style={{
                color: isPending ? 'var(--accent)' : 'var(--text-faint)',
                fontStyle: isPending ? 'italic' : 'normal',
              }}
              title={call.input}
            >
              {fileLabel}
            </span>
          ) : (
            <span
              className="text-[11px] leading-snug truncate selectable"
              style={{ color: 'var(--text-faint)' }}
              title={call.input}
            >
              {call.input}
            </span>
          )}
        </div>

        {/* Duration (completed calls) or elapsed counter (pending) */}
        {call.duration !== undefined && (
          <span
            className="shrink-0 text-[10px] tabular-nums mt-0.5"
            style={{ color: 'var(--text-faint)' }}
          >
            {formatDurationShort(call.duration)}
          </span>
        )}
        {isPending && elapsedSec > 0 && (
          <span
            className="shrink-0 text-[10px] tabular-nums mt-0.5"
            style={{ color: 'var(--accent)', opacity: 0.8 }}
          >
            {elapsedSec}s
          </span>
        )}

        {/* Status icon */}
        <span className="shrink-0 mt-0.5">
          {call.status === 'pending' && <SpinnerIcon />}
          {call.status === 'success' && <SuccessIcon />}
          {call.status === 'error' && <ErrorIcon />}
        </span>
      </button>

      {/* Expanded output panel */}
      {expanded && hasOutput && (
        <div
          className="mx-3 mb-2 ml-8 rounded overflow-hidden"
          style={{
            border: '1px solid var(--border-muted)',
            background: 'color-mix(in srgb, var(--bg) 80%, var(--bg-tertiary))',
          }}
        >
          <div
            className="overflow-y-auto overflow-x-auto p-2 text-[11px] leading-relaxed whitespace-pre-wrap break-all selectable"
            style={{
              maxHeight: '200px',
              fontFamily: 'var(--font-mono)',
              color: call.status === 'error' ? 'var(--error)' : 'var(--text)',
            }}
          >
            {call.output}
          </div>
        </div>
      )}

      {/* Expanded but no output — show placeholder */}
      {expanded && !hasOutput && call.status !== 'pending' && (
        <div
          className="mx-3 mb-2 ml-8 px-2 py-1.5 rounded text-[10px] italic"
          style={{
            color: 'var(--text-faint)',
            background: 'color-mix(in srgb, var(--bg) 80%, var(--bg-tertiary))',
            border: '1px solid var(--border-muted)',
          }}
        >
          No output captured.
        </div>
      )}
    </div>
  );
});

// ─── Main component ───────────────────────────────────────────────────────────

interface ToolCallFeedProps {
  toolCalls: ToolCallEvent[];
}

export const ToolCallFeed = memo(function ToolCallFeed({
  toolCalls,
}: ToolCallFeedProps): React.ReactElement {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const handleToggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleExpandAll = useCallback(() => {
    setExpandedIds(new Set(toolCalls.map((tc) => tc.id)));
  }, [toolCalls]);

  const handleCollapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  const allExpanded = toolCalls.length > 0 && expandedIds.size >= toolCalls.length;

  // Auto-scroll to bottom when new tool calls arrive, unless user has scrolled up
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isAtBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 40;

    if (isAtBottom) {
      bottomRef.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [toolCalls.length]);

  if (toolCalls.length === 0) {
    return (
      <div className="px-3 py-3 text-[11px] italic" style={{ color: 'var(--text-faint)' }}>
        No tool calls yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Feed header with expand/collapse toggle */}
      <div
        className="flex items-center justify-between px-3 py-1"
        style={{ borderBottom: '1px solid var(--border-muted)' }}
      >
        <span className="text-[10px] font-medium" style={{ color: 'var(--text-faint)' }}>
          {toolCalls.length} tool call{toolCalls.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={allExpanded ? handleCollapseAll : handleExpandAll}
          className="shrink-0 text-[10px] px-1.5 py-0.5 rounded transition-colors"
          style={{
            color: 'var(--text-faint)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-tertiary)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)';
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          }}
          title={allExpanded ? 'Collapse all tool outputs' : 'Expand all tool outputs'}
        >
          {allExpanded ? 'Collapse All' : 'Expand All'}
        </button>
      </div>

      {/* Tool call list */}
      <div
        ref={containerRef}
        className="overflow-y-auto overflow-x-hidden"
        style={{ maxHeight: '320px' }}
      >
        {/* Inject spinner keyframes once */}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

        {toolCalls.map((call) => (
          <ToolCallRow
            key={call.id}
            call={call}
            expanded={expandedIds.has(call.id)}
            onToggle={handleToggle}
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
});
