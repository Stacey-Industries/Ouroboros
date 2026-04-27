/**
 * WorkbenchMenuBar — style constants + keyboard map (Wave 59 Phase C).
 * Extracted to keep WorkbenchMenuBar.tsx under the 300-line ESLint limit.
 */

import type React from 'react';

// Alt+Letter shortcut map (File=F, Edit=E, View=V, Tools=T, Help=H)
export const ALT_KEY_MAP: Record<string, number> = { f: 0, e: 1, v: 2, t: 3, h: 4 };

export const dropdownStyle: React.CSSProperties = {
  minWidth: '220px',
  padding: '4px 0',
  borderRadius: '6px',
  // hardcoded: opacity-only shadow scrim, allowed per renderer.md
  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
  zIndex: 1000,
  backdropFilter: 'blur(24px) saturate(140%)',
  WebkitBackdropFilter: 'blur(24px) saturate(140%)',
  ...({ WebkitAppRegion: 'no-drag' } as React.CSSProperties),
};

export const separatorStyle: React.CSSProperties = {
  height: '1px',
  backgroundColor: 'var(--border-semantic)',
  margin: '4px 8px',
};

export const menuItemRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  height: '28px',
  padding: '0 12px',
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  fontSize: '12px',
  fontFamily: 'var(--font-ui, sans-serif)',
  transition: 'background-color 80ms ease',
  gap: '16px',
  textAlign: 'left',
  lineHeight: '28px',
  whiteSpace: 'nowrap',
};

export const menuButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  height: '100%',
  padding: '0 10px',
  border: 'none',
  background: 'transparent',
  fontSize: '12px',
  fontFamily: 'var(--font-ui, sans-serif)',
  cursor: 'pointer',
  transition: 'color 100ms ease, background-color 100ms ease',
  whiteSpace: 'nowrap',
};
