import React, { useEffect, useState } from 'react';

import { useConfig } from '../../hooks/useConfig';
import {
  DEFAULT_SPINNER_CHARS,
  DEFAULT_THINKING_VERBS,
} from '../../themes/thinkingDefaults';

export interface AgentChatThinkingBlockProps {
  content: string;
  duration?: number;
  isStreaming: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

// ── Spinner ───────────────────────────────────────────────────────────────────

const SPINNER_INTERVAL_MS = 100;

function useSpinnerFrame(chars: string, active: boolean): string {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % chars.length), SPINNER_INTERVAL_MS);
    return () => clearInterval(id);
  }, [active, chars.length]);
  return chars[frame % chars.length] ?? chars[0];
}

// ── Verb rotation ─────────────────────────────────────────────────────────────

const VERB_INTERVAL_MS = 3000;

function useThinkingVerb(verbs: readonly string[], active: boolean): string {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (!active || verbs.length <= 1) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % verbs.length), VERB_INTERVAL_MS);
    return () => clearInterval(id);
  }, [active, verbs.length]);
  return verbs[idx % verbs.length] ?? verbs[0];
}

// ── Resolve config → verbs + spinnerChars ─────────────────────────────────────

function useThinkingConfig(): { verbs: readonly string[]; spinnerChars: string } {
  const { config } = useConfig();
  const theming = config?.theming;
  const spinnerChars = theming?.spinnerChars || DEFAULT_SPINNER_CHARS;
  let verbs: readonly string[];
  if (theming?.verbOverride && theming.verbOverride.trim().length > 0) {
    verbs = [theming.verbOverride.trim()];
  } else if (theming?.thinkingVerbs && theming.thinkingVerbs.length > 0) {
    verbs = theming.thinkingVerbs;
  } else {
    verbs = DEFAULT_THINKING_VERBS;
  }
  return { verbs, spinnerChars };
}

// ── Sub-components ────────────────────────────────────────────────────────────

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

function StreamingLabel({ verbs, spinnerChars }: {
  verbs: readonly string[];
  spinnerChars: string;
}): React.ReactElement {
  const verb = useThinkingVerb(verbs, true);
  const spinChar = useSpinnerFrame(spinnerChars, true);
  return (
    <span data-testid="thinking-streaming-label">
      {spinChar} {verb}…
    </span>
  );
}

function getBorderLeftColor(isStreaming: boolean, isCollapsed: boolean): string {
  if (isStreaming) return 'var(--interactive-accent)';
  if (isCollapsed) return 'transparent';
  return 'var(--border-default)';
}

function getStaticLabel(duration: number | undefined): string {
  return `Thought${duration !== undefined ? ` for ${duration < 1 ? '<1' : duration}s` : ''}`;
}

const THINKING_PULSE_CSS = `
  .agent-chat-thinking-pulse {
    animation: agentChatThinkingPulse 2s ease-in-out infinite;
  }
  @keyframes agentChatThinkingPulse {
    0%, 100% { border-left-color: var(--interactive-accent); }
    50% { border-left-color: var(--border-default); }
  }
`;

function ThinkingContent({
  content,
  isStreaming,
  isCollapsed,
}: {
  content: string;
  isStreaming: boolean;
  isCollapsed: boolean;
}): React.ReactElement {
  return (
    <div className="agent-chat-thinking-collapse" data-collapsed={isCollapsed ? 'true' : 'false'}>
      <div
        className="max-h-[300px] overflow-y-auto whitespace-pre-wrap px-2.5 pb-2 text-xs leading-relaxed text-text-semantic-muted"
        style={{ fontFamily: 'var(--font-ui)' }}
      >
        {content || (isStreaming ? '' : '(empty)')}
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export const AgentChatThinkingBlock = React.memo(function AgentChatThinkingBlock({
  content,
  duration,
  isStreaming,
  collapsed,
  onToggleCollapse,
}: AgentChatThinkingBlockProps): React.ReactElement {
  const isCollapsed = collapsed && !isStreaming;
  const { verbs, spinnerChars } = useThinkingConfig();

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
        {isStreaming
          ? <StreamingLabel verbs={verbs} spinnerChars={spinnerChars} />
          : <span>{getStaticLabel(duration)}</span>}
        {duration !== undefined && !isStreaming && <DurationBadge duration={duration} />}
      </button>
      <ThinkingContent content={content} isStreaming={isStreaming} isCollapsed={isCollapsed} />
      <style>{THINKING_PULSE_CSS}</style>
    </div>
  );
});
