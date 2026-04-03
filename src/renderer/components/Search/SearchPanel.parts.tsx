/**
 * SearchPanel.parts — sub-components for the project-wide search panel.
 */

import React from 'react';

// ── SearchInput ───────────────────────────────────────────────────────────────

interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

const INPUT_STYLE: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: '4px 8px',
  borderRadius: '4px',
  fontSize: '0.8125rem',
  fontFamily: 'var(--font-ui)',
  outline: 'none',
  boxSizing: 'border-box',
};

function handleFocus(e: React.FocusEvent<HTMLInputElement>): void {
  e.currentTarget.style.borderColor = 'var(--interactive-accent)';
}

function handleBlur(e: React.FocusEvent<HTMLInputElement>): void {
  e.currentTarget.style.borderColor = 'var(--border-default)';
}

export function SearchInput({ value, onChange, inputRef }: SearchInputProps): React.ReactElement {
  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Search files..."
      aria-label="Search in files"
      className="selectable bg-surface-inset border border-border-semantic text-text-semantic-primary placeholder:text-text-semantic-faint"
      style={INPUT_STYLE}
      onFocus={handleFocus}
      onBlur={handleBlur}
    />
  );
}

// ── SearchToggle ──────────────────────────────────────────────────────────────

interface SearchToggleProps {
  label: string;
  title: string;
  active: boolean;
  onClick: () => void;
}

const TOGGLE_STYLE: React.CSSProperties = {
  width: '22px',
  height: '22px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '3px',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.6875rem',
  fontWeight: 600,
  flexShrink: 0,
  transition: 'background 120ms',
};

export function SearchToggle({ label, title, active, onClick }: SearchToggleProps): React.ReactElement {
  return (
    <button
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={active
        ? 'bg-interactive-accent text-text-semantic-on-accent'
        : 'bg-transparent text-text-semantic-muted hover:text-text-semantic-secondary hover:bg-surface-raised'}
      style={TOGGLE_STYLE}
    >
      {label}
    </button>
  );
}

// ── SearchToggleBar ───────────────────────────────────────────────────────────

interface SearchToggleBarProps {
  isRegex: boolean;
  caseSensitive: boolean;
  wholeWord: boolean;
  onToggleRegex: () => void;
  onToggleCase: () => void;
  onToggleWord: () => void;
}

export function SearchToggleBar({
  isRegex, caseSensitive, wholeWord,
  onToggleRegex, onToggleCase, onToggleWord,
}: SearchToggleBarProps): React.ReactElement {
  return (
    <div className="flex items-center gap-0.5">
      <SearchToggle label=".*" title="Use Regular Expression (Alt+R)" active={isRegex} onClick={onToggleRegex} />
      <SearchToggle label="Aa" title="Match Case (Alt+C)" active={caseSensitive} onClick={onToggleCase} />
      <SearchToggle label="ab" title="Match Whole Word (Alt+W)" active={wholeWord} onClick={onToggleWord} />
    </div>
  );
}

// ── FilterInputs ──────────────────────────────────────────────────────────────

interface FilterInputsProps {
  includeGlob: string;
  excludeGlob: string;
  onIncludeChange: (v: string) => void;
  onExcludeChange: (v: string) => void;
  expanded: boolean;
  onToggle: () => void;
}

const FILTER_INPUT_STYLE: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: '3px 6px',
  borderRadius: '3px',
  fontSize: '0.75rem',
  fontFamily: 'var(--font-ui)',
  outline: 'none',
  boxSizing: 'border-box',
};

function FilterInput({ value, placeholder, onChange }: {
  value: string; placeholder: string; onChange: (v: string) => void;
}): React.ReactElement {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="bg-surface-inset border border-border-semantic text-text-semantic-primary placeholder:text-text-semantic-faint"
      style={FILTER_INPUT_STYLE}
      onFocus={handleFocus}
      onBlur={handleBlur}
    />
  );
}

const FILTER_LABEL_STYLE: React.CSSProperties = {
  fontSize: '0.6875rem',
  fontFamily: 'var(--font-ui)',
  flexShrink: 0,
  width: '50px',
};

export function FilterInputs({
  includeGlob, excludeGlob, onIncludeChange, onExcludeChange, expanded, onToggle,
}: FilterInputsProps): React.ReactElement {
  return (
    <div className="flex flex-col gap-1">
      <button
        className="flex items-center gap-1 text-text-semantic-faint hover:text-text-semantic-muted border-none bg-transparent cursor-pointer"
        style={{ fontSize: '0.6875rem', fontFamily: 'var(--font-ui)', padding: '2px 0' }}
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span style={{ transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 120ms', display: 'inline-block' }}>▾</span>
        <span>Files to include/exclude</span>
      </button>
      {expanded && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-text-semantic-faint" style={FILTER_LABEL_STYLE}>Include</span>
            <FilterInput value={includeGlob} placeholder="e.g. *.ts,src/**" onChange={onIncludeChange} />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-text-semantic-faint" style={FILTER_LABEL_STYLE}>Exclude</span>
            <FilterInput value={excludeGlob} placeholder="e.g. **/node_modules" onChange={onExcludeChange} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── SearchStatus ──────────────────────────────────────────────────────────────

interface SearchStatusProps {
  query: string;
  resultCount: number;
  fileCount: number;
  isSearching: boolean;
  error: string | null;
}

export function SearchStatus({ query, resultCount, fileCount, isSearching, error }: SearchStatusProps): React.ReactElement | null {
  const style: React.CSSProperties = {
    fontSize: '0.6875rem',
    fontFamily: 'var(--font-ui)',
    padding: '4px 8px',
    flexShrink: 0,
  };

  if (error) {
    return (
      <div className="text-status-error" style={style}>{error}</div>
    );
  }

  if (isSearching) {
    return (
      <div className="text-text-semantic-muted" style={style}>Searching…</div>
    );
  }

  if (!query || query.length < 2) return null;

  if (resultCount === 0) {
    return (
      <div className="text-text-semantic-muted" style={style}>
        {`No results found for '${query}'`}
      </div>
    );
  }

  return (
    <div className="text-text-semantic-muted" style={style}>
      {`${resultCount} result${resultCount !== 1 ? 's' : ''} in ${fileCount} file${fileCount !== 1 ? 's' : ''}`}
    </div>
  );
}

// ── TruncatedWarning ──────────────────────────────────────────────────────────

export function TruncatedWarning(): React.ReactElement {
  return (
    <div
      className="bg-status-warning-subtle text-status-warning"
      style={{ fontSize: '0.6875rem', fontFamily: 'var(--font-ui)', padding: '6px 8px', flexShrink: 0 }}
    >
      Results capped at 500. Refine your search.
    </div>
  );
}

