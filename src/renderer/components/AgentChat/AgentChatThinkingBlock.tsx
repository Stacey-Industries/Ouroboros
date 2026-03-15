import React from 'react';

export interface AgentChatThinkingBlockProps {
  content: string;
  duration?: number;
  isStreaming: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

function ChevronIcon({ collapsed }: { collapsed: boolean }): React.ReactElement {
  return (
    <svg
      className={`h-3 w-3 shrink-0 transition-transform duration-200 ${collapsed ? '' : 'rotate-90'}`}
      viewBox="0 0 16 16"
      fill="none"
      style={{ color: 'var(--text-muted)' }}
    >
      <path
        d="M6 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DurationBadge({ duration }: { duration: number }): React.ReactElement {
  const label = duration < 1 ? '<1s' : `${duration}s`;
  return (
    <span
      className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
      style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}
    >
      {label}
    </span>
  );
}

/**
 * Renders an extended thinking block from the assistant.
 *
 * While streaming: expanded with a pulsing left border and muted text.
 * After streaming completes: auto-collapses to "Thought for Xs" summary line.
 * Collapsed: chevron + duration badge; click to expand.
 * Expanded: full thinking text in a visually distinct style.
 */
export function AgentChatThinkingBlock({
  content,
  duration,
  isStreaming,
  collapsed,
  onToggleCollapse,
}: AgentChatThinkingBlockProps): React.ReactElement {
  const isCollapsed = collapsed && !isStreaming;

  return (
    <div
      className={`rounded-md ${isStreaming ? 'agent-chat-thinking-pulse' : ''}`}
      style={{
        borderLeft: `2px solid ${isStreaming ? 'var(--accent)' : isCollapsed ? 'transparent' : 'var(--border)'}`,
        backgroundColor: isCollapsed ? 'transparent' : 'var(--bg-tertiary)',
      }}
    >
      {/* Header row — always visible */}
      <button
        onClick={onToggleCollapse}
        className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors duration-100 hover:bg-[var(--bg-tertiary)]"
        style={{ color: 'var(--text-muted)' }}
      >
        <ChevronIcon collapsed={isCollapsed} />
        <span>
          {isStreaming
            ? 'Thinking...'
            : `Thought${duration !== undefined ? ` for ${duration < 1 ? '<1' : duration}s` : ''}`}
        </span>
        {duration !== undefined && !isStreaming && <DurationBadge duration={duration} />}
      </button>

      {/* Collapsible content with CSS transition */}
      <div
        className="agent-chat-thinking-collapse"
        data-collapsed={isCollapsed ? 'true' : 'false'}
      >
        <div
          className="px-2.5 pb-2 max-h-[300px] overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed"
          style={{
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-ui)',
          }}
        >
          {content || (isStreaming ? '' : '(empty)')}
        </div>
      </div>

      {/* Inline pulsing animation */}
      <style>{`
        .agent-chat-thinking-pulse {
          animation: agentChatThinkingPulse 2s ease-in-out infinite;
        }
        @keyframes agentChatThinkingPulse {
          0%, 100% { border-left-color: var(--accent); }
          50% { border-left-color: var(--border); }
        }
      `}</style>
    </div>
  );
}
