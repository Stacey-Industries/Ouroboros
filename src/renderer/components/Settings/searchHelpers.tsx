/**
 * searchHelpers.tsx — Search utilities shared by SettingsModal and SettingsPanel.
 */

import React from 'react';

import { SETTINGS_ENTRIES, type SettingsEntry } from './settingsEntries';

export interface SearchMatch {
  entry: SettingsEntry;
  /** Regions of the label that matched (for highlight) */
  labelRanges: Array<[number, number]>;
}

export function searchEntries(query: string): SearchMatch[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  return SETTINGS_ENTRIES.flatMap((entry): SearchMatch[] => {
    const label = entry.label.toLowerCase();
    const desc = (entry.description ?? '').toLowerCase();
    if (!label.includes(q) && !desc.includes(q)) return [];

    const labelRanges = findLabelRanges(label, q);
    return [{ entry, labelRanges }];
  });
}

function findLabelRanges(label: string, query: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let start = 0;
  while (true) {
    const idx = label.indexOf(query, start);
    if (idx === -1) break;
    ranges.push([idx, idx + query.length]);
    start = idx + query.length;
  }
  return ranges;
}

export function HighlightedText({
  text,
  ranges,
}: {
  text: string;
  ranges: Array<[number, number]>;
}): React.ReactElement<any> {
  if (ranges.length === 0) {
    return <span>{text}</span>;
  }

  const parts: React.ReactNode[] = [];
  let pos = 0;
  for (const [start, end] of ranges) {
    if (pos < start) {
      parts.push(<span key={pos}>{text.slice(pos, start)}</span>);
    }
    parts.push(
      <mark key={start} style={highlightStyle}>
        {text.slice(start, end)}
      </mark>,
    );
    pos = end;
  }
  if (pos < text.length) {
    parts.push(<span key={pos}>{text.slice(pos)}</span>);
  }
  return <>{parts}</>;
}

const highlightStyle: React.CSSProperties = {
  background: 'color-mix(in srgb, var(--interactive-accent) 30%, transparent)',
  color: 'inherit',
  borderRadius: '2px',
  padding: '0 1px',
};
