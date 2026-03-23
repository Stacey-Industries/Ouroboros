import React from 'react';

import type { SearchBarController } from './SearchBar.controller';

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  top: '8px',
  right: '24px',
  zIndex: 20,
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  padding: '4px 8px',
  backgroundColor: 'var(--surface-panel)',
  border: '1px solid var(--border-semantic)',
  borderRadius: '6px',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
  fontFamily: 'var(--font-ui)',
  fontSize: '0.8125rem',
};

const inputStyle: React.CSSProperties = {
  width: '200px',
  height: '26px',
  padding: '0 6px',
  backgroundColor: 'var(--surface-base)',
  border: '1px solid var(--border-semantic)',
  borderRadius: '3px',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.8125rem',
  outline: 'none',
};

const matchCountStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  minWidth: '70px',
  textAlign: 'center',
  userSelect: 'none',
  whiteSpace: 'nowrap',
};

const iconButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '26px',
  height: '26px',
  padding: 0,
  background: 'transparent',
  border: '1px solid var(--border-semantic)',
  borderRadius: '3px',
};

function getToggleButtonStyle(active: boolean, fontFamily: string): React.CSSProperties {
  return {
    ...iconButtonStyle,
    background: active ? 'var(--interactive-accent)' : 'transparent',
    color: active ? 'var(--text-on-accent)' : 'var(--text-muted)',
    borderColor: active ? 'var(--interactive-accent)' : 'var(--border-semantic)',
    cursor: 'pointer',
    fontSize: '0.75rem',
    fontWeight: 600,
    fontFamily,
  };
}

function getNavButtonStyle(enabled: boolean): React.CSSProperties {
  return {
    ...iconButtonStyle,
    color: enabled ? 'var(--text-muted)' : 'var(--text-faint)',
    cursor: enabled ? 'pointer' : 'default',
    opacity: enabled ? 1 : 0.5,
  };
}

function ArrowIcon({ direction }: { direction: 'up' | 'down' }): React.ReactElement {
  const path = direction === 'up' ? 'M2 8L6 4L10 8' : 'M2 4L6 8L10 4';
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d={path} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon(): React.ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ToggleButton(props: {
  active: boolean;
  label: string;
  title: string;
  fontFamily: string;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button title={props.title} onClick={props.onClick} style={getToggleButtonStyle(props.active, props.fontFamily)}>
      {props.label}
    </button>
  );
}

function IconButton(props: {
  title: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <button title={props.title} onClick={props.onClick} disabled={props.disabled} style={getNavButtonStyle(!props.disabled)}>
      {props.children}
    </button>
  );
}

function SearchInput({ controller }: { controller: SearchBarController }): React.ReactElement {
  return (
    <input
      ref={controller.inputRef}
      type="text"
      value={controller.query}
      onChange={(event) => controller.setQuery(event.target.value)}
      placeholder="Find..."
      spellCheck={false}
      className="text-text-semantic-primary"
      style={inputStyle}
      onFocus={(event) => {
        event.target.style.borderColor = 'var(--interactive-accent)';
      }}
      onBlur={(event) => {
        event.target.style.borderColor = 'var(--border-semantic)';
      }}
    />
  );
}

function MatchCount({ controller }: { controller: SearchBarController }): React.ReactElement {
  return (
    <span
      style={{
        ...matchCountStyle,
        color: controller.canNavigate ? 'var(--text-muted)' : 'var(--text-faint)',
      }}
    >
      {controller.matchLabel}
    </span>
  );
}

function SearchToggles({ controller }: { controller: SearchBarController }): React.ReactElement {
  return (
    <>
      <ToggleButton
        active={controller.caseSensitive}
        label="Aa"
        title="Case sensitive (Alt+C)"
        fontFamily="var(--font-ui)"
        onClick={controller.toggleCaseSensitive}
      />
      <ToggleButton
        active={controller.useRegex}
        label=".*"
        title="Use regular expression (Alt+R)"
        fontFamily="var(--font-mono)"
        onClick={controller.toggleRegex}
      />
    </>
  );
}

function SearchNavigation({ controller }: { controller: SearchBarController }): React.ReactElement {
  return (
    <>
      <IconButton title="Previous match (Shift+Enter)" onClick={controller.goToPrev} disabled={!controller.canNavigate}>
        <ArrowIcon direction="up" />
      </IconButton>
      <IconButton title="Next match (Enter)" onClick={controller.goToNext} disabled={!controller.canNavigate}>
        <ArrowIcon direction="down" />
      </IconButton>
      <IconButton title="Close (Escape)" onClick={controller.handleClose}>
        <CloseIcon />
      </IconButton>
    </>
  );
}

export function SearchBarPanel(controller: SearchBarController): React.ReactElement {
  return (
    <div style={panelStyle} onKeyDown={controller.handleKeyDown}>
      <SearchInput controller={controller} />
      <MatchCount controller={controller} />
      <SearchToggles controller={controller} />
      <SearchNavigation controller={controller} />
    </div>
  );
}
