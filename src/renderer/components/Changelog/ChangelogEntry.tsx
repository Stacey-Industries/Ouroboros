/**
 * ChangelogEntry.tsx — one version card in the changelog drawer.
 * Wave 38 Phase E.
 */
import type { ChangelogEntry as Entry } from '@renderer/generated/changelog';
import React from 'react';

interface Props {
  entry: Entry;
}

interface SectionProps {
  label: string;
  items: string[];
}

function BulletSection({ label, items }: SectionProps): React.ReactElement {
  return (
    <div className="mt-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-text-semantic-muted">
        {label}
      </span>
      <ul className="mt-1 space-y-1 pl-3">
        {items.map((item, i) => (
          <li key={i} className="list-disc text-sm text-text-semantic-primary">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ChangelogEntryCard({ entry }: Props): React.ReactElement {
  return (
    <div className="rounded border border-border-semantic p-3">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-sm font-semibold text-text-semantic-primary">
          v{entry.version}
        </span>
        {entry.date && (
          <span className="text-xs text-text-semantic-muted">{entry.date}</span>
        )}
      </div>
      {entry.added && entry.added.length > 0 && (
        <BulletSection label="Added" items={entry.added} />
      )}
      {entry.changed && entry.changed.length > 0 && (
        <BulletSection label="Changed" items={entry.changed} />
      )}
      {entry.fixed && entry.fixed.length > 0 && (
        <BulletSection label="Fixed" items={entry.fixed} />
      )}
      {entry.removed && entry.removed.length > 0 && (
        <BulletSection label="Removed" items={entry.removed} />
      )}
    </div>
  );
}
