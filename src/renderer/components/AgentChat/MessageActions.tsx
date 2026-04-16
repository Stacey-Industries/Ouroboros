/**
 * MessageActions.tsx — Shared per-message action bar.
 *
 * Exposes: Copy as Markdown, Copy as Plain, Raw toggle, and a placeholder
 * slot for Reactions (Phase C).
 *
 * Copy as Plain strips common markdown syntax without an external dependency.
 */

import React, { useCallback, useState } from 'react';

import { useToastContext } from '../../contexts/ToastContext';

// ── Plain-text stripping ──────────────────────────────────────────────────────

/** Strip common markdown constructs to produce readable plain text. */
export function stripMarkdown(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`{3}[\s\S]*?`{3}/g, '')
    .replace(/`(.+?)`/g, '$1')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/!\[.*?\]\(.+?\)/g, '')
    .replace(/^>\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function CheckIcon(): React.ReactElement {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function CopyIcon(): React.ReactElement {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

// ── Action button ─────────────────────────────────────────────────────────────

function ActionBtn(props: {
  title: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  const activeClass = props.active
    ? 'bg-interactive-accent-subtle text-interactive-accent'
    : 'text-text-semantic-muted hover:bg-surface-hover hover:text-text-semantic-primary';
  return (
    <button
      type="button"
      title={props.title}
      onClick={props.onClick}
      className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors duration-100 ${activeClass}`}
    >
      {props.children}
    </button>
  );
}

// ── Copy hook ────────────────────────────────────────────────────────────────

function useCopyAction(content: string, label: string): { copied: boolean; copy: () => void } {
  const [copied, setCopied] = useState(false);
  const { toast } = useToastContext();
  const copy = useCallback(() => {
    void navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      toast(`Copied${label ? ` (${label})` : ''}`, 'success');
      setTimeout(() => setCopied(false), 2000);
    });
  }, [content, label, toast]);
  return { copied, copy };
}

// ── Public component ──────────────────────────────────────────────────────────

export interface MessageActionsProps {
  /** Raw message content (markdown). */
  content: string;
  /** Whether the raw markdown view is currently active. */
  showRaw: boolean;
  /** Toggle raw markdown view. */
  onToggleRaw: () => void;
  /** Placeholder slot for Phase C reactions. Pass null to omit. */
  reactionsSlot?: React.ReactNode;
}

export function MessageActions(props: MessageActionsProps): React.ReactElement {
  const mdCopy = useCopyAction(props.content, 'MD');
  const plainCopy = useCopyAction(stripMarkdown(props.content), 'plain');

  return (
    <div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-100 group-hover:opacity-100">
      <ActionBtn
        title={mdCopy.copied ? 'Copied!' : 'Copy as Markdown'}
        onClick={mdCopy.copy}
      >
        {mdCopy.copied ? <CheckIcon /> : <CopyIcon />}
        <span>MD</span>
      </ActionBtn>
      <ActionBtn
        title={plainCopy.copied ? 'Copied!' : 'Copy as plain text'}
        onClick={plainCopy.copy}
      >
        {plainCopy.copied ? <CheckIcon /> : <CopyIcon />}
        <span>Plain</span>
      </ActionBtn>
      <ActionBtn
        title={props.showRaw ? 'Show rendered markdown' : 'Show raw markdown'}
        active={props.showRaw}
        onClick={props.onToggleRaw}
      >
        <span>Raw</span>
      </ActionBtn>
      {props.reactionsSlot ?? null}
    </div>
  );
}
