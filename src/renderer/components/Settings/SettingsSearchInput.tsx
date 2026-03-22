/**
 * SettingsSearchInput.tsx — Search input bar for settings.
 */

import React from 'react';

interface SettingsSearchInputProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (value: string) => void;
}

export function SettingsSearchInput({
  inputRef,
  value,
  onChange,
}: SettingsSearchInputProps): React.ReactElement {
  return (
    <div style={wrapperStyle}>
      <div style={{ position: 'relative' }}>
        <span aria-hidden="true" className="text-text-semantic-muted" style={iconStyle}>
          ⌕
        </span>
        <input
          ref={inputRef}
          type="search"
          placeholder="Search settings..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Search settings"
          className="text-text-semantic-primary"
          style={inputStyle}
        />
        {value && (
          <button
            onClick={() => onChange('')}
            aria-label="Clear search"
            className="text-text-semantic-muted"
            style={clearStyle}
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

const wrapperStyle: React.CSSProperties = {
  padding: '10px 16px',
  flexShrink: 0,
  background: 'transparent',
};

const iconStyle: React.CSSProperties = {
  position: 'absolute',
  left: '10px',
  top: '50%',
  transform: 'translateY(-50%)',
  fontSize: '13px',
  pointerEvents: 'none',
  lineHeight: 1,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 32px 7px 30px',
  borderRadius: '6px',
  border: '1px solid var(--border)',
  background: 'var(--bg-tertiary)',
  fontSize: '13px',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'var(--font-ui)',
};

const clearStyle: React.CSSProperties = {
  position: 'absolute',
  right: '8px',
  top: '50%',
  transform: 'translateY(-50%)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: '14px',
  lineHeight: 1,
  padding: '2px',
};
