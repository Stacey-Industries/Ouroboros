import type { CSSProperties } from 'react';

import type { SymbolKind } from '../../hooks/useSymbolOutline';

export const KIND_ICON: Record<SymbolKind, string> = {
  function: '\u0192',
  class: 'C',
  interface: 'I',
  type: 'T',
  method: 'm',
  variable: 'v',
  heading: 'H',
};

export const KIND_COLOR: Record<SymbolKind, string> = {
  function: '#daa520',
  class: '#4ec9b0',
  interface: '#9cdcfe',
  type: '#c586c0',
  method: '#b5cea8',
  variable: '#9cdcfe',
  heading: '#569cd6',
};

export const CODE_PADDING_TOP = 16;
export const SCROLL_OFFSET = 32;
export const DEFAULT_LINE_HEIGHT = 20.8;
export const FLASH_CLASS_NAME = 'outline-line-flash';
export const FLASH_STYLE_ID = '__symbol-outline-flash__';
export const FLASH_DURATION_MS = 950;
export const FLASH_STYLE_TEXT = `
  @keyframes outline-flash {
    0%   { background-color: rgba(255, 200, 0, 0.35); }
    60%  { background-color: rgba(255, 200, 0, 0.35); }
    100% { background-color: transparent; }
  }
  .outline-line-flash {
    animation: outline-flash 900ms ease-out forwards;
  }
`;

const OUTLINE_WIDTH = '180px';

export const OUTLINE_PANEL_STYLE: CSSProperties = {
  width: OUTLINE_WIDTH,
  flexShrink: 0,
  borderLeft: '1px solid var(--border-muted)',
  backgroundColor: 'var(--surface-base)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

export const OUTLINE_EMPTY_STATE_STYLE: CSSProperties = {
  width: OUTLINE_WIDTH,
  flexShrink: 0,
  borderLeft: '1px solid var(--border-muted)',
  backgroundColor: 'var(--surface-base)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '0.6875rem',
  fontFamily: 'var(--font-ui)',
  padding: '16px 8px',
  textAlign: 'center',
};

export const OUTLINE_HEADER_STYLE: CSSProperties = {
  flexShrink: 0,
  padding: '4px 8px',
  borderBottom: '1px solid var(--border-muted)',
  fontSize: '0.6875rem',
  fontFamily: 'var(--font-ui)',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  userSelect: 'none',
};

export const OUTLINE_LIST_STYLE: CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  overflowX: 'hidden',
};

export const OUTLINE_NAME_STYLE: CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
  minWidth: 0,
};

export function getOutlineItemStyle(
  depth: number,
  isActive: boolean
): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    width: '100%',
    paddingLeft: `${8 + depth * 12}px`,
    paddingRight: '8px',
    paddingTop: '2px',
    paddingBottom: '2px',
    background: isActive ? 'var(--surface-panel)' : 'none',
    border: 'none',
    borderLeft: isActive ? '2px solid var(--interactive-accent)' : '2px solid transparent',
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.6875rem',
    lineHeight: '1.5',
    color: isActive ? 'var(--text)' : 'var(--text-muted)',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    flexShrink: 0,
    minWidth: 0,
  };
}

export function getOutlineIconStyle(color: string): CSSProperties {
  return {
    flexShrink: 0,
    fontFamily: 'var(--font-mono)',
    fontSize: '0.6875rem',
    color,
    width: '10px',
    textAlign: 'center',
    userSelect: 'none',
  };
}
