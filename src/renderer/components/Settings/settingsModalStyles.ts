/**
 * settingsModalStyles.ts — Styles and keyframes for SettingsModal.
 */

import type React from 'react';

export const cancelButtonStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: '6px',
  border: '1px solid var(--border-default)',
  background: 'transparent',
  fontSize: '13px',
  cursor: 'pointer',
};

export function saveButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '8px 20px',
    borderRadius: '6px',
    border: 'none',
    background: disabled ? 'var(--surface-raised)' : 'var(--interactive-accent)',
    color: disabled ? 'var(--text-muted)' : 'var(--text-on-accent)',
    fontSize: '13px',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}

export const KEYFRAMES = `
  @keyframes settings-overlay-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes settings-overlay-out {
    from { opacity: 1; }
    to   { opacity: 0; }
  }
  @keyframes settings-card-in {
    from { opacity: 0; transform: scale(0.96) translateY(-8px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
  }
  @keyframes settings-card-out {
    from { opacity: 1; transform: scale(1) translateY(0); }
    to   { opacity: 0; transform: scale(0.96) translateY(-8px); }
  }
`;
