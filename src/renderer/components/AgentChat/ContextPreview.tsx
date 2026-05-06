/**
 * ContextPreview.tsx — Collapsed strip + tabbed popover showing what gets sent
 * with the next prompt. Tabs: Rules / Skills / Memory / Files / Mentions /
 * Tools / System. Toggle state is parent-managed (controlled).
 */

import React from 'react';

import type { ContextPreviewModel } from '../../hooks/useContextPreview';
import { ContextPreviewPopover } from './ContextPreview.popover';

// ─── ContextPreviewProps ──────────────────────────────────────────────────────

export interface ContextPreviewProps {
  model: ContextPreviewModel;
  isOpen: boolean;
  onToggle: () => void;
  /** Called when the user clicks a toggleable item's checkbox. */
  onToggleItem?: (id: string) => void;
  /** Set of item IDs currently disabled (unchecked) by the user. */
  disabledIds?: ReadonlySet<string>;
  /** Project root passed to memory:read for inline drill-down. */
  projectRoot?: string | null;
}

// ─── Strip ────────────────────────────────────────────────────────────────────

function pluralize(n: number, word: string): string {
  return `${n} ${word}${n !== 1 ? 's' : ''}`;
}

function buildStripChips(totals: ContextPreviewModel['totals']): string[] {
  const parts: string[] = [];
  if (totals.rules > 0) parts.push(pluralize(totals.rules, 'rule'));
  if (totals.skills > 0) parts.push(pluralize(totals.skills, 'skill'));
  if (totals.files > 0) parts.push(pluralize(totals.files, 'file'));
  if (totals.mentions > 0) parts.push(pluralize(totals.mentions, 'mention'));
  if (totals.tools > 0) parts.push(pluralize(totals.tools, 'tool'));
  return parts;
}

function buildStripLabel(model: ContextPreviewModel): string {
  const { totals } = model;
  const total = totals.totalItems;
  if (total === 0) return 'No context — expand';
  const chips = buildStripChips(totals);
  const summary = chips.length > 0 ? ` (${chips.join(', ')})` : '';
  return `${pluralize(total, 'item')} will be sent${summary} — expand`;
}

function ChevronIcon({ open }: { open: boolean }): React.ReactElement {
  const style = {
    transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
    transition: 'transform 150ms',
  };
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" style={style}>
      <path
        d="M2 3.5L5 6.5L8 3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatTokens(n: number): string {
  return n >= 1000 ? `~${(n / 1000).toFixed(1)}k tokens` : `~${n} tokens`;
}

function ContextPreviewStrip(props: {
  model: ContextPreviewModel;
  isOpen: boolean;
  onToggle: () => void;
}): React.ReactElement {
  const { model, isOpen, onToggle } = props;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
      aria-haspopup="dialog"
      data-testid="context-preview-toggle"
      className="flex w-full items-center gap-2 px-3 py-1 text-left text-[11px] text-text-semantic-muted transition-colors hover:text-text-semantic-secondary hover:bg-surface-hover"
      style={{ fontFamily: 'var(--font-ui)' }}
    >
      <ChevronIcon open={isOpen} />
      <span className="flex-1 truncate">{buildStripLabel(model)}</span>
      <span className="shrink-0 text-text-semantic-faint">
        {formatTokens(model.totals.totalTokens)}
      </span>
    </button>
  );
}

// ─── ContextPreview ───────────────────────────────────────────────────────────

export function ContextPreview({
  model,
  isOpen,
  onToggle,
  onToggleItem,
  disabledIds = new Set(),
  projectRoot,
}: ContextPreviewProps): React.ReactElement {
  return (
    <div className="relative" data-testid="context-preview">
      {isOpen && (
        <ContextPreviewPopover
          model={model}
          onClose={onToggle}
          onToggleItem={onToggleItem}
          disabledIds={disabledIds}
          projectRoot={projectRoot}
        />
      )}
      <ContextPreviewStrip model={model} isOpen={isOpen} onToggle={onToggle} />
    </div>
  );
}
