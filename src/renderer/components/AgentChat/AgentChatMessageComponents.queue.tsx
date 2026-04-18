import React from 'react';

import { EmptyStateMessage } from '../EmptyState';
import type { QueuedMessage } from './useAgentChatWorkspace';

const SUGGESTED_PROMPTS = [
  {
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4M12 8h.01" />
      </svg>
    ),
    title: 'Explain the architecture',
    description: 'Overview of project structure and key patterns',
    prompt: 'Explain the architecture of this project',
  },
  {
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
      </svg>
    ),
    title: 'Find and fix bugs',
    description: 'Analyze recent changes for potential issues',
    prompt: 'Find and fix bugs in recent changes',
  },
  {
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
    title: 'Write tests',
    description: 'Generate test coverage for the current file',
    prompt: 'Write tests for the current file',
  },
  {
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
    title: 'Refactor for performance',
    description: 'Optimize code for speed and maintainability',
    prompt: 'Refactor for better performance',
  },
];

function SuggestedPromptGrid({
  onSelectPrompt,
}: {
  onSelectPrompt?: (prompt: string) => void;
}): React.ReactElement {
  return (
    <div className="grid w-full max-w-[440px] grid-cols-2 gap-2">
      {SUGGESTED_PROMPTS.map((item) => (
        <button
          key={item.prompt}
          onClick={() => onSelectPrompt?.(item.prompt)}
          className="flex flex-col gap-1.5 rounded-lg border border-border-semantic px-3 py-2.5 text-left transition-colors duration-150 hover:bg-surface-raised"
        >
          <div className="flex items-center gap-1.5 text-text-semantic-muted">
            {item.icon}
            <span className="text-xs font-medium text-text-semantic-primary">{item.title}</span>
          </div>
          <span className="text-[11px] leading-snug text-text-semantic-muted">
            {item.description}
          </span>
        </button>
      ))}
    </div>
  );
}

export function EmptyConversationState({
  onSelectPrompt,
}: {
  onSelectPrompt?: (prompt: string) => void;
}): React.ReactElement {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      {/* Wave 38 Phase C — i18n empty-state prompt (persistent dismiss via config key).
          Wrapper constrains height so EmptyStateMessage doesn't collapse the prompt grid. */}
      <div style={{ position: 'relative', width: '100%', maxWidth: '440px' }}>
        <EmptyStateMessage
          messageKey="emptyState.chat.primary"
          dismissKey="chat"
        />
      </div>
      <SuggestedPromptGrid onSelectPrompt={onSelectPrompt} />
    </div>
  );
}

const SVG_PROPS = {
  width: 12,
  height: 12,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};
const BTN_BASE = 'rounded p-0.5 text-[10px] transition-colors duration-100 hover:bg-surface-raised';

function ActionBtn(p: {
  onClick: () => void;
  title: string;
  cls: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <button onClick={p.onClick} title={p.title} className={`${BTN_BASE} ${p.cls}`}>
      {p.children}
    </button>
  );
}

interface QueuedItemActionsProps {
  id: string;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onSendNow: (id: string) => Promise<void>;
}

function QueuedItemActions(props: QueuedItemActionsProps): React.ReactElement {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <ActionBtn
        onClick={() => props.onEdit(props.id)}
        title="Edit — move back to composer"
        cls="text-text-semantic-muted"
      >
        <svg {...SVG_PROPS}>
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </ActionBtn>
      <ActionBtn
        onClick={() => void props.onSendNow(props.id)}
        title="Send now — interrupt current task"
        cls="text-interactive-accent"
      >
        <svg {...SVG_PROPS}>
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      </ActionBtn>
      <ActionBtn
        onClick={() => props.onDelete(props.id)}
        title="Remove from queue"
        cls="text-text-semantic-muted hover:text-status-error"
      >
        <svg {...SVG_PROPS}>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </ActionBtn>
    </div>
  );
}

function QueuedItem(props: {
  msg: QueuedMessage;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onSendNow: (id: string) => Promise<void>;
}): React.ReactElement {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border-semantic bg-surface-base px-2.5 py-1.5">
      <div
        className="min-w-0 flex-1 truncate text-xs text-text-semantic-primary"
        title={props.msg.content}
      >
        {props.msg.content.length > 80 ? `${props.msg.content.slice(0, 80)}...` : props.msg.content}
      </div>
      <QueuedItemActions
        id={props.msg.id}
        onEdit={props.onEdit}
        onDelete={props.onDelete}
        onSendNow={props.onSendNow}
      />
    </div>
  );
}

export function QueuedMessageBanner(props: {
  messages: QueuedMessage[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onSendNow: (id: string) => Promise<void>;
}): React.ReactElement | null {
  if (props.messages.length === 0) return null;
  return (
    <div className="border-t border-border-semantic px-3 py-1.5">
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-text-semantic-muted">
        Queued ({props.messages.length})
      </div>
      <div className="space-y-1">
        {props.messages.map((msg) => (
          <QueuedItem
            key={msg.id}
            msg={msg}
            onEdit={props.onEdit}
            onDelete={props.onDelete}
            onSendNow={props.onSendNow}
          />
        ))}
      </div>
    </div>
  );
}
