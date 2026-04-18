/**
 * BundleCard.tsx — single bundle row in the MarketplacePanel list.
 *
 * Wave 37 Phase D.
 */

import React, { useState } from 'react';

import type { BundleManifestEntry } from '../../types/electron-marketplace';

// ── Kind badge colours ────────────────────────────────────────────────────────

const KIND_CLASSES: Record<string, string> = {
  theme: 'bg-interactive-accent-subtle text-interactive-accent',
  prompt: 'bg-status-info-subtle text-status-info',
  'rules-and-skills': 'bg-status-warning-subtle text-status-warning',
};

// ── Component ─────────────────────────────────────────────────────────────────

export interface BundleCardProps {
  entry: BundleManifestEntry;
  onInstall: (entryId: string, title: string) => Promise<void>;
}

function useInstallHandler(
  entry: BundleManifestEntry,
  onInstall: (id: string, title: string) => Promise<void>,
): [boolean, () => void] {
  const [installing, setInstalling] = useState(false);
  function handleInstall(): void {
    setInstalling(true);
    onInstall(entry.id, entry.title).catch(() => {
      /* errors are surfaced via the onInstall callback's own toast logic */
    }).finally(() => { setInstalling(false); });
  }
  return [installing, handleInstall];
}

export function BundleCard({ entry, onInstall }: BundleCardProps): React.ReactElement {
  const [installing, handleInstall] = useInstallHandler(entry, onInstall);
  const badgeClass = KIND_CLASSES[entry.kind] ?? 'bg-surface-raised text-text-semantic-muted';

  return (
    <div className="flex items-start gap-3 p-3 mb-2 rounded-md border border-border-subtle bg-surface-raised hover:bg-surface-hover transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-text-semantic-primary text-sm font-medium truncate">
            {entry.title}
          </span>
          <span className={`text-xs px-1.5 py-0.5 rounded font-mono shrink-0 ${badgeClass}`}>
            {entry.kind}
          </span>
          <span className="text-text-semantic-faint text-xs shrink-0">
            v{entry.version}
          </span>
        </div>
        <p className="text-text-semantic-secondary text-xs line-clamp-2 mb-0.5">
          {entry.description}
        </p>
        <span className="text-text-semantic-muted text-xs">{entry.author}</span>
      </div>
      <button
        onClick={handleInstall}
        disabled={installing}
        aria-label={`Install ${entry.title}`}
        className="shrink-0 text-xs px-3 py-1.5 rounded bg-interactive-accent text-text-on-accent hover:bg-interactive-hover disabled:opacity-50 transition-colors"
      >
        {installing ? 'Installing…' : 'Install'}
      </button>
    </div>
  );
}
