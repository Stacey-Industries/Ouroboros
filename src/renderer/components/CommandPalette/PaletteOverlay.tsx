import React from 'react';

// ─── Overlay ─────────────────────────────────────────────────────────────────

export interface PaletteOverlayProps {
  isVisible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export function PaletteOverlay({
  isVisible,
  onClose,
  children,
}: PaletteOverlayProps): React.ReactElement | null {
  if (!isVisible) return null;

  return (
    <div
      aria-modal="true"
      role="dialog"
      aria-label="Command Palette"
      onClick={onClose}
      style={overlayStyle}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-panel border border-border-semantic"
        style={cardStyle}
      >
        {children}
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 9999,
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  paddingTop: '15vh',
  backgroundColor: 'rgba(0, 0, 0, 0.55)',
  animation: 'cp-overlay-in 120ms ease',
};

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '520px',
  borderRadius: '8px',
  overflow: 'hidden',
  boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
  animation: 'cp-card-in 120ms ease',
};

// ─── CategoryHeader ───────────────────────────────────────────────────────────

export function CategoryHeader({ label }: { label: string }): React.ReactElement {
  return (
    <div aria-hidden="true" className="text-text-semantic-faint" style={headerStyle}>
      {label}
    </div>
  );
}

const headerStyle: React.CSSProperties = {
  padding: '6px 16px 2px',
  fontSize: '10px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  fontFamily: 'var(--font-mono)',
  userSelect: 'none',
};

// ─── Footer ──────────────────────────────────────────────────────────────────

export interface PaletteFooterProps {
  hints: string[];
}

export function PaletteFooter({ hints }: PaletteFooterProps): React.ReactElement {
  return (
    <div className="text-text-semantic-muted" style={footerStyle}>
      {hints.map((hint) => (
        <span key={hint}>{hint}</span>
      ))}
    </div>
  );
}

const footerStyle: React.CSSProperties = {
  display: 'flex',
  gap: '14px',
  padding: '6px 14px',
  borderTop: '1px solid var(--border-default)',
  fontSize: '11px',
  fontFamily: 'var(--font-mono)',
};
