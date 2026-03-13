/**
 * SettingsSearchResults.tsx — Search results list for settings.
 */

import React from 'react';
import type { SettingsEntry } from './settingsEntries';
import type { SearchMatch } from './searchHelpers';
import { HighlightedText } from './searchHelpers';

interface SettingsSearchResultsProps {
  searchQuery: string;
  searchResults: SearchMatch[];
  onResultClick: (entry: SettingsEntry) => void;
}

export function SettingsSearchResults({
  searchQuery,
  searchResults,
  onResultClick,
}: SettingsSearchResultsProps): React.ReactElement {
  if (searchResults.length === 0) {
    return (
      <p style={emptyStyle}>
        No settings matching &ldquo;{searchQuery}&rdquo;
      </p>
    );
  }

  return (
    <div style={listStyle}>
      {searchResults.map((match, idx) => (
        <SearchResultItem
          key={idx}
          match={match}
          onClick={() => onResultClick(match.entry)}
        />
      ))}
    </div>
  );
}

function SearchResultItem({
  match,
  onClick,
}: {
  match: SearchMatch;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button onClick={onClick} style={itemStyle}>
      <div style={itemHeaderStyle}>
        <span style={labelStyle}>
          <HighlightedText text={match.entry.label} ranges={match.labelRanges} />
        </span>
        <span style={badgeStyle}>{match.entry.sectionLabel}</span>
      </div>
      {match.entry.description && (
        <span style={descStyle}>{match.entry.description}</span>
      )}
    </button>
  );
}

const emptyStyle: React.CSSProperties = {
  margin: '32px 0',
  textAlign: 'center',
  fontSize: '13px',
  color: 'var(--text-muted)',
};

const listStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
};

const itemStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  padding: '10px 14px',
  borderRadius: '6px',
  border: '1px solid var(--border)',
  background: 'var(--bg-secondary)',
  cursor: 'pointer',
  textAlign: 'left',
  width: '100%',
};

const itemHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  justifyContent: 'space-between',
};

const labelStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 500,
  color: 'var(--text)',
};

const badgeStyle: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--accent)',
  flexShrink: 0,
};

const descStyle: React.CSSProperties = {
  fontSize: '11px',
  color: 'var(--text-muted)',
  lineHeight: 1.4,
};
