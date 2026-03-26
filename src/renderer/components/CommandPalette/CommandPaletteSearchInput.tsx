import React from 'react';

const inputContainerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '0 14px',
  borderBottom: '1px solid var(--border-default)',
  height: '46px',
};

const inputPrefixStyle: React.CSSProperties = {
  fontSize: '14px',
  flexShrink: 0,
  fontFamily: 'var(--font-mono)',
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  background: 'transparent',
  border: 'none',
  outline: 'none',
  fontSize: '14px',
  fontFamily: 'var(--font-ui)',
  caretColor: 'var(--interactive-accent)',
};

interface CommandPaletteSearchInputProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  isOpen: boolean;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onQueryChange: (value: string) => void;
  placeholder: string;
  query: string;
  selectedId?: string;
}

export function CommandPaletteSearchInput({
  inputRef,
  isOpen,
  onKeyDown,
  onQueryChange,
  placeholder,
  query,
  selectedId,
}: CommandPaletteSearchInputProps): React.ReactElement {
  return (
    <div style={inputContainerStyle}>
      <span className="text-text-semantic-muted" style={inputPrefixStyle}>
        &gt;
      </span>
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-autocomplete="list"
        aria-controls="cp-listbox"
        aria-activedescendant={selectedId ? `cp-item-${selectedId}` : undefined}
        placeholder={placeholder}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={onKeyDown}
        className="text-text-semantic-primary"
        style={inputStyle}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />
    </div>
  );
}
