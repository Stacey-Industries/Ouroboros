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
      className={`h-3 w-3 shrink-0 transition-transform duration-200 text-text-semantic-muted ${collapsed ? '' : 'rotate-90'}`}
      viewBox="0 0 16 16"
      fill="none"
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
  return (
    <span className="rounded-full bg-surface-raised px-1.5 py-0.5 text-[10px] font-medium text-text-semantic-muted">
      {duration < 1 ? '<1s' : `${duration}s`}
    </span>
  );
}

function getThinkingLabel(duration: number | undefined, isStreaming: boolean): string {
  if (isStreaming) return 'Thinking...';
  return `Thought${duration !== undefined ? ` for ${duration < 1 ? '<1' : duration}s` : ''}`;
}

function getBorderLeftColor(isStreaming: boolean, isCollapsed: boolean): string {
  if (isStreaming) return 'var(--interactive-accent)';
  if (isCollapsed) return 'transparent';
  return 'var(--border-default)';
}

export const AgentChatThinkingBlock = React.memo(function AgentChatThinkingBlock({
  content,
  duration,
  isStreaming,
  collapsed,
  onToggleCollapse,
}: AgentChatThinkingBlockProps): React.ReactElement {
  const isCollapsed = collapsed && !isStreaming;
  const label = getThinkingLabel(duration, isStreaming);

  return (
    <div
      className={`rounded-md ${isStreaming ? 'agent-chat-thinking-pulse' : ''} ${isCollapsed ? '' : 'bg-surface-raised'}`}
      style={{ borderLeft: `2px solid ${getBorderLeftColor(isStreaming, isCollapsed)}` }}
    >
      <button
        onClick={onToggleCollapse}
        className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-xs text-text-semantic-muted transition-colors duration-100 hover:bg-surface-raised"
      >
        <ChevronIcon collapsed={isCollapsed} />
        <span>{label}</span>
        {duration !== undefined && !isStreaming && <DurationBadge duration={duration} />}
      </button>
      <div className="agent-chat-thinking-collapse" data-collapsed={isCollapsed ? 'true' : 'false'}>
        <div
          className="max-h-[300px] overflow-y-auto whitespace-pre-wrap px-2.5 pb-2 text-xs leading-relaxed text-text-semantic-muted"
          style={{ fontFamily: 'var(--font-ui)' }}
        >
          {content || (isStreaming ? '' : '(empty)')}
        </div>
      </div>
      <style>{`
        .agent-chat-thinking-pulse {
          animation: agentChatThinkingPulse 2s ease-in-out infinite;
        }
        @keyframes agentChatThinkingPulse {
          0%, 100% { border-left-color: var(--interactive-accent); }
          50% { border-left-color: var(--border-default); }
        }
      `}</style>
    </div>
  );
});
