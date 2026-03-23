import React from 'react';

import type { MentionItem, MentionType } from './MentionAutocomplete';

export interface MentionChipProps {
  mention: MentionItem;
  onRemove: () => void;
}

function getChipColor(type: MentionType): { bg: string; border: string; text: string } {
  switch (type) {
    case 'file':
      return {
        bg: 'rgba(100, 100, 255, 0.08)',
        border: 'rgba(100, 100, 255, 0.25)',
        text: 'var(--interactive-accent)',
      };
    case 'folder':
      return {
        bg: 'rgba(229, 192, 123, 0.08)',
        border: 'rgba(229, 192, 123, 0.25)',
        text: '#e5c07b',
      };
    case 'diff':
      return {
        bg: 'rgba(63, 185, 80, 0.08)',
        border: 'rgba(63, 185, 80, 0.25)',
        text: 'var(--status-success)',
      };
    case 'terminal':
      return {
        bg: 'rgba(179, 146, 240, 0.08)',
        border: 'rgba(179, 146, 240, 0.25)',
        text: '#b392f0',
      };
  }
}

function ChipIcon({ type }: { type: MentionType }): React.ReactElement {
  switch (type) {
    case 'file':
      return (
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      );
    case 'folder':
      return (
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      );
    case 'diff':
      return (
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3v18M3 12h18" />
        </svg>
      );
    case 'terminal':
      return (
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
      );
  }
}

function truncatePath(path: string, maxLen = 30): string {
  if (path.length <= maxLen) return path;
  const parts = path.split('/');
  if (parts.length <= 2) return `...${path.slice(-(maxLen - 3))}`;
  return `.../${parts.slice(-2).join('/')}`;
}

function formatTokenCount(tokens: number): string {
  if (tokens >= 1000) {
    const k = tokens / 1000;
    return `~${k >= 10 ? Math.round(k) : k.toFixed(1)}k`;
  }
  return `~${tokens}`;
}

export function MentionChip({ mention, onRemove }: MentionChipProps): React.ReactElement {
  const colors = getChipColor(mention.type);

  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] leading-tight transition-all duration-100 hover:opacity-90"
      style={{
        backgroundColor: colors.bg,
        borderColor: colors.border,
        color: colors.text,
      }}
      title={`${mention.path} (${formatTokenCount(mention.estimatedTokens)} tokens)`}
    >
      <ChipIcon type={mention.type} />
      <span className="max-w-[140px] truncate" style={{ fontFamily: 'var(--font-mono)' }}>
        {mention.type === 'file' || mention.type === 'folder'
          ? truncatePath(mention.path)
          : mention.label}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="ml-0.5 rounded-sm opacity-60 transition-opacity duration-75 hover:opacity-100"
        aria-label={`Remove ${mention.label}`}
      >
        &times;
      </button>
    </span>
  );
}

export interface MentionChipsBarProps {
  mentions: MentionItem[];
  onRemove: (key: string) => void;
  totalTokens: number;
}

export function MentionChipsBar({
  mentions,
  onRemove,
  totalTokens,
}: MentionChipsBarProps): React.ReactElement | null {
  if (mentions.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-1 pb-1.5 pt-1">
      {mentions.map((mention) => (
        <MentionChip key={mention.key} mention={mention} onRemove={() => onRemove(mention.key)} />
      ))}
      <span className="ml-auto text-[10px] text-text-semantic-muted">
        {formatTokenCount(totalTokens)} tokens
      </span>
    </div>
  );
}
