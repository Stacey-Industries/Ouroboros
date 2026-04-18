/**
 * ChangelogDrawer.tsx — in-app changelog drawer shown on version bump.
 * Wave 38 Phase E.
 *
 * Mounts as a root-level overlay alongside FirstRunTourGate in App.tsx.
 * Opens when currentVersion !== config.platform.lastSeenVersion and there
 * are CHANGELOG entries in that range. Dismiss writes lastSeenVersion.
 */
import type { ChangelogEntry } from '@renderer/generated/changelog';
import React, { useCallback, useState } from 'react';

import { useConfig } from '../../hooks/useConfig';
import { ChangelogEntryCard } from './ChangelogEntry';
import { useShouldShowChangelog } from './useShouldShowChangelog';

// ── Missing-module warning ────────────────────────────────────────────────────

function MissingModuleWarning(): React.ReactElement {
  return (
    <div
      className="fixed bottom-4 right-4 z-50 max-w-sm rounded border border-status-warning-subtle bg-status-warning-subtle p-3 text-sm text-text-semantic-primary shadow"
      role="alert"
    >
      Changelog not generated — run{' '}
      <code className="font-mono text-xs">npm run build:changelog</code>
    </div>
  );
}

// ── Drawer content ────────────────────────────────────────────────────────────

interface DrawerProps {
  entries: ChangelogEntry[];
  onDismiss: () => void;
}

function DrawerContent({ entries, onDismiss }: DrawerProps): React.ReactElement {
  return (
    <div
      className="fixed inset-y-0 right-0 z-50 flex w-96 flex-col border-l border-border-semantic bg-surface-panel shadow-xl"
      role="dialog"
      aria-label="What's new"
    >
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
        <span className="font-semibold text-text-semantic-primary">What&apos;s new</span>
        <button
          className="rounded px-3 py-1 text-sm text-text-semantic-secondary hover:bg-surface-hover"
          onClick={onDismiss}
          type="button"
        >
          Dismiss all
        </button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {entries.map(e => (
          <ChangelogEntryCard key={e.version} entry={e} />
        ))}
      </div>
    </div>
  );
}

// ── Gate + orchestrator ───────────────────────────────────────────────────────

export function ChangelogDrawer(): React.ReactElement | null {
  const { config, set } = useConfig();
  const { shouldShow, currentVersion, visibleVersions, moduleAbsent } =
    useShouldShowChangelog();
  const [dismissed, setDismissed] = useState(false);

  const handleDismiss = useCallback(async () => {
    setDismissed(true);
    if (!currentVersion || !config) return;
    const existing = config.platform ?? {};
    await set('platform', { ...existing, lastSeenVersion: currentVersion });
  }, [config, currentVersion, set]);

  if (moduleAbsent) return <MissingModuleWarning />;
  if (!shouldShow || dismissed) return null;

  // Lazily load the generated module to build the entry list.
  return (
    <ChangelogDrawerLoader
      visibleVersions={visibleVersions}
      onDismiss={handleDismiss}
    />
  );
}

// ── Async loader (avoids top-level dynamic import in the gate) ────────────────

interface LoaderProps {
  visibleVersions: string[];
  onDismiss: () => void;
}

function ChangelogDrawerLoader({
  visibleVersions,
  onDismiss,
}: LoaderProps): React.ReactElement | null {
  const [entries, setEntries] = React.useState<ChangelogEntry[] | null>(null);

  React.useEffect(() => {
    import('@renderer/generated/changelog')
      .then(mod => {
        const resolved = visibleVersions
          .map(v => mod.CHANGELOG[v])
          .filter((e): e is ChangelogEntry => Boolean(e));
        setEntries(resolved);
      })
      .catch(() => setEntries([]));
  }, [visibleVersions]);

  if (!entries || entries.length === 0) return null;
  return <DrawerContent entries={entries} onDismiss={onDismiss} />;
}
