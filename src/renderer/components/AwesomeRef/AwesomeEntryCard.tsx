/**
 * AwesomeEntryCard.tsx — single entry card in the Awesome Ouroboros panel.
 *
 * Wave 37 Phase E. Renders title, description, category badge, tags,
 * copy-to-clipboard button, and optional install/instructions button.
 * Hook install is intentionally manual — shows an instructions modal trigger
 * instead of auto-writing to the filesystem.
 */

import React, { useState } from 'react';

import type { AwesomeEntry } from '../../awesomeRef/awesomeData';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AwesomeEntryCardProps {
  entry: AwesomeEntry;
  onInstall: (entry: AwesomeEntry) => void;
}

// ── Category badge colours ────────────────────────────────────────────────────

const CATEGORY_CLASSES: Record<string, string> = {
  hooks: 'bg-status-warning-subtle text-status-warning',
  'slash-commands': 'bg-interactive-accent-subtle text-interactive-accent',
  'mcp-configs': 'bg-status-info-subtle text-status-info',
  rules: 'bg-status-success-subtle text-status-success',
  skills: 'bg-surface-raised text-text-semantic-secondary',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function CopyButton({ content }: { content: string }): React.ReactElement {
  const [copied, setCopied] = useState(false);

  function handleCopy(): void {
    void navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <button
      onClick={handleCopy}
      aria-label="Copy to clipboard"
      title="Copy to clipboard"
      className="shrink-0 text-xs px-2 py-1 rounded border border-border-subtle text-text-semantic-muted hover:text-text-semantic-primary hover:border-border-semantic transition-colors"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

interface ActionButtonsProps {
  entry: AwesomeEntry;
  onInstall: (entry: AwesomeEntry) => void;
}

function ActionButtons({ entry, onInstall }: ActionButtonsProps): React.ReactElement | null {
  if (!entry.installAction) return null;

  if (entry.installAction.kind === 'hook') {
    return (
      <button
        onClick={() => onInstall(entry)}
        aria-label="How to install this hook"
        className="shrink-0 text-xs px-2 py-1 rounded border border-border-subtle text-text-semantic-muted hover:text-text-semantic-primary transition-colors"
      >
        How to install
      </button>
    );
  }

  return (
    <button
      onClick={() => onInstall(entry)}
      aria-label={`Install ${entry.title}`}
      className="shrink-0 text-xs px-3 py-1 rounded bg-interactive-accent text-text-on-accent hover:bg-interactive-hover transition-colors"
    >
      Install
    </button>
  );
}

// ── Main card ─────────────────────────────────────────────────────────────────

export function AwesomeEntryCard({ entry, onInstall }: AwesomeEntryCardProps): React.ReactElement {
  const badgeClass = CATEGORY_CLASSES[entry.category] ?? 'bg-surface-raised text-text-semantic-muted';

  return (
    <div className="flex items-start gap-3 p-3 mb-2 rounded-md border border-border-subtle bg-surface-raised hover:bg-surface-hover transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span className="text-text-semantic-primary text-sm font-medium truncate">
            {entry.title}
          </span>
          <span className={`text-xs px-1.5 py-0.5 rounded font-mono shrink-0 ${badgeClass}`}>
            {entry.category}
          </span>
        </div>
        <p className="text-text-semantic-secondary text-xs mb-1 line-clamp-2">
          {entry.description}
        </p>
        {entry.author && (
          <span className="text-text-semantic-faint text-xs">{entry.author}</span>
        )}
        {entry.tags && entry.tags.length > 0 && (
          <div className="flex gap-1 mt-1 flex-wrap">
            {entry.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs px-1 py-0.5 rounded bg-surface-inset text-text-semantic-muted"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <CopyButton content={entry.content} />
        <ActionButtons entry={entry} onInstall={onInstall} />
      </div>
    </div>
  );
}
