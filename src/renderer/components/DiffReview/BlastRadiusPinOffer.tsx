/**
 * BlastRadiusPinOffer.tsx — Toast/card offering to also pin the top-N callers
 * when the user pins a file that has known callers in the graph.
 *
 * Gated on the `review.enhanced` feature flag. When false nothing is rendered.
 */

import React, { useMemo } from 'react';

import type { BlastRadiusEntry } from '../../types/electron-graph';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BlastRadiusPinOfferProps {
  callers: BlastRadiusEntry[];
  maxDisplay?: number;
  onAccept: (keys: string[]) => void;
  onDismiss: () => void;
  enabled: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toPinKey(entry: BlastRadiusEntry): string {
  const { name, filePath, line } = entry.node;
  return `@symbol:${filePath}::${name}::${line}`;
}

function pluralise(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}

function criticalityColour(level: string): string {
  if (level === 'critical') return 'var(--status-error)';
  if (level === 'high') return 'var(--status-warning)';
  if (level === 'medium') return 'var(--status-info)';
  return 'var(--text-semantic-faint)';
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CallerRow({ entry }: { entry: BlastRadiusEntry }): React.ReactElement {
  return (
    <li className="flex items-center gap-2 text-xs text-text-semantic-muted">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: criticalityColour(entry.criticality) }} aria-hidden />
      <span className="truncate font-mono">{entry.node.name}</span>
      <span className="ml-auto shrink-0 text-[10px] text-text-semantic-faint">d={entry.distance}</span>
    </li>
  );
}

interface OfferActionsProps {
  onAccept: () => void;
  onDismiss: () => void;
}

function OfferActions({ onAccept, onDismiss }: OfferActionsProps): React.ReactElement {
  return (
    <div className="flex gap-2">
      <button className="rounded bg-interactive-accent px-2.5 py-1 text-xs font-medium text-text-on-accent hover:bg-interactive-hover transition-colors" onClick={onAccept}>
        Accept
      </button>
      <button className="rounded px-2.5 py-1 text-xs text-text-semantic-muted hover:text-text-semantic-primary transition-colors" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function BlastRadiusPinOffer({ callers, maxDisplay = 3, onAccept, onDismiss, enabled }: BlastRadiusPinOfferProps): React.ReactElement | null {
  const topCallers = useMemo(
    () => [...callers].sort((a, b) => a.distance - b.distance).slice(0, maxDisplay),
    [callers, maxDisplay],
  );

  if (!enabled || topCallers.length === 0) return null;

  const count = topCallers.length;
  const label = pluralise(count, '1 caller', `${count} callers`);
  const keys = topCallers.map(toPinKey);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border-accent bg-surface-raised px-3 py-2.5 shadow-lg" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-text-semantic-primary">
          Also include <span className="font-semibold">{label}</span> that depend on this file?
        </p>
        <button className="shrink-0 text-text-semantic-faint hover:text-text-semantic-primary transition-colors text-sm leading-none" onClick={onDismiss} aria-label="Dismiss caller offer">×</button>
      </div>
      <ul className="flex flex-col gap-0.5">
        {topCallers.map((entry) => <CallerRow key={entry.node.id} entry={entry} />)}
      </ul>
      <OfferActions onAccept={() => onAccept(keys)} onDismiss={onDismiss} />
    </div>
  );
}
