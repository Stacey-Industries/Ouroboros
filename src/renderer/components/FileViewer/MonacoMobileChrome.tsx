import React from 'react';

const chromeStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  padding: '4px 8px',
  borderBottom: '1px solid var(--border-semantic)',
  background: 'var(--surface-panel)',
  flexShrink: 0,
};

const ctaStyle: React.CSSProperties = {
  fontSize: '11px',
  padding: '2px 8px',
  borderRadius: '4px',
  border: '1px solid var(--border-subtle)',
  background: 'var(--surface-raised)',
  color: 'var(--text-semantic-muted)',
  cursor: 'not-allowed',
  opacity: 0.6,
};

/**
 * Thin chrome bar above the mobile fallback editor.
 * The "Open in desktop" CTA is a stub — future Wave 34 will wire it.
 */
export function MonacoMobileChrome(): React.ReactElement {
  return (
    <div style={chromeStyle}>
      <button
        disabled
        title="Desktop mode required"
        style={ctaStyle}
        type="button"
      >
        Open in desktop
      </button>
    </div>
  );
}
