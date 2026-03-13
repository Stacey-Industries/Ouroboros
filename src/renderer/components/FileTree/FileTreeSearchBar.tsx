import React from 'react';

export interface FileTreeSearchBarProps {
  query: string;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  inputRef: React.RefObject<HTMLInputElement | null>;
  heatMapEnabled: boolean;
  heatMapCount: number;
  onToggleHeatMap: () => void;
}

const searchBarStyle: React.CSSProperties = {
  padding: '6px 8px',
  flexShrink: 0,
  borderBottom: '1px solid var(--border-muted)',
};

const searchRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '4px',
  alignItems: 'center',
};

const searchInputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: '4px 8px',
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: '4px',
  color: 'var(--text)',
  fontSize: '0.8125rem',
  fontFamily: 'var(--font-ui)',
  outline: 'none',
  boxSizing: 'border-box',
};

function handleInputFocus(e: React.FocusEvent<HTMLInputElement>): void {
  e.currentTarget.style.borderColor = 'var(--accent)';
}

function handleInputBlur(e: React.FocusEvent<HTMLInputElement>): void {
  e.currentTarget.style.borderColor = 'var(--border)';
}

function heatMapTitle(enabled: boolean, count: number): string {
  if (!enabled) return 'Show file edit heat map';
  return `Heat map ON - ${count} file${count !== 1 ? 's' : ''} tracked (click to disable)`;
}

function heatMapStyle(enabled: boolean): React.CSSProperties {
  return {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '26px',
    height: '26px',
    padding: 0,
    background: enabled ? 'rgba(239, 68, 68, 0.15)' : 'transparent',
    border: enabled
      ? '1px solid rgba(239, 68, 68, 0.3)'
      : '1px solid var(--border)',
    borderRadius: '4px',
    cursor: 'pointer',
    color: enabled ? '#ef4444' : 'var(--text-faint)',
    transition: 'all 150ms',
  };
}

function HeatMapIcon({ enabled }: { enabled: boolean }): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M8 1C8 1 3 6 3 10a5 5 0 0 0 10 0c0-4-5-9-5-9zM6.5 12.5a2 2 0 0 1-1-1.73c0-1.5 2.5-4.27 2.5-4.27s2.5 2.77 2.5 4.27a2 2 0 0 1-1 1.73"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={enabled ? 'currentColor' : 'none'}
        fillOpacity={enabled ? 0.3 : 0}
      />
    </svg>
  );
}

function HeatMapToggle({
  enabled,
  count,
  onToggle,
}: {
  enabled: boolean;
  count: number;
  onToggle: () => void;
}): React.ReactElement {
  return (
    <button
      onClick={onToggle}
      title={heatMapTitle(enabled, count)}
      aria-label={enabled ? 'Disable heat map overlay' : 'Enable heat map overlay'}
      aria-pressed={enabled}
      style={heatMapStyle(enabled)}
    >
      <HeatMapIcon enabled={enabled} />
    </button>
  );
}

export function FileTreeSearchBar({
  query,
  setQuery,
  inputRef,
  heatMapEnabled,
  heatMapCount,
  onToggleHeatMap,
}: FileTreeSearchBarProps): React.ReactElement {
  return (
    <div style={searchBarStyle}>
      <div style={searchRowStyle}>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search files..."
          aria-label="Filter files"
          className="selectable"
          style={searchInputStyle}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
        />
        <HeatMapToggle
          enabled={heatMapEnabled}
          count={heatMapCount}
          onToggle={onToggleHeatMap}
        />
      </div>
    </div>
  );
}
