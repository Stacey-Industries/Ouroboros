import React from 'react';

/**
 * Shared modal overlay used by FilePicker and SymbolSearch.
 * Similar to PaletteOverlay but with a configurable maxWidth and animation prefix.
 */
export interface PickerOverlayProps {
  label: string;
  animPrefix: string;
  maxWidth: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function PickerOverlay({ label, animPrefix, maxWidth, onClose, children }: PickerOverlayProps): React.ReactElement {
  return (
    <div
      aria-modal="true"
      role="dialog"
      aria-label={label}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '15vh',
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        animation: `${animPrefix}-overlay-in 120ms ease`,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth,
          borderRadius: '8px',
          overflow: 'hidden',
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
          animation: `${animPrefix}-card-in 120ms ease`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** Shared search input bar for pickers. */
export interface PickerInputProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  prefix: string;
  placeholder: string;
  value: string;
  isOpen: boolean;
  controlsId: string;
  onChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  statusText?: string;
}

export function PickerInput({
  inputRef,
  prefix,
  placeholder,
  value,
  isOpen,
  controlsId,
  onChange,
  onKeyDown,
  statusText,
}: PickerInputProps): React.ReactElement {
  return (
    <div style={inputContainerStyle}>
      <span style={prefixStyle}>{prefix}</span>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-autocomplete="list"
        aria-controls={controlsId}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        style={inputStyle}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />
      {statusText && <span style={statusStyle}>{statusText}</span>}
    </div>
  );
}

const inputContainerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '0 14px',
  borderBottom: '1px solid var(--border)',
  height: '46px',
};

const prefixStyle: React.CSSProperties = {
  fontSize: '14px',
  color: 'var(--text-muted)',
  flexShrink: 0,
  fontFamily: 'var(--font-mono)',
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  background: 'transparent',
  border: 'none',
  outline: 'none',
  fontSize: '14px',
  color: 'var(--text)',
  fontFamily: 'var(--font-ui)',
  caretColor: 'var(--accent)',
};

const statusStyle: React.CSSProperties = {
  fontSize: '11px',
  color: 'var(--text-muted)',
  fontFamily: 'var(--font-mono)',
  flexShrink: 0,
};
