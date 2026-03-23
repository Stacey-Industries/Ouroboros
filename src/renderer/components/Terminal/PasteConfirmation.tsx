/**
 * PasteConfirmBanner — confirmation banner shown at the bottom of the terminal
 * when the user tries to paste text exceeding the safety threshold.
 */

import React from 'react';

export const PASTE_CONFIRM_THRESHOLD = 1000;

interface PasteConfirmBannerProps {
  text: string;
  onConfirm: () => void;
  onConfirmSingleLine: () => void;
  onCancel: () => void;
}

const bannerStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  zIndex: 20,
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 14px',
  fontFamily: 'var(--font-ui, sans-serif)',
  fontSize: 12,
  boxShadow: '0 -2px 8px rgba(0,0,0,0.2)',
};

const confirmBtnStyle: React.CSSProperties = {
  padding: '3px 12px',
  borderRadius: 4,
  border: 'none',
  backgroundColor: 'var(--interactive-accent)',
  fontFamily: 'var(--font-ui, sans-serif)',
  fontSize: 12,
  cursor: 'pointer',
  fontWeight: 600,
};

const singleLineBtnStyle: React.CSSProperties = {
  padding: '3px 10px',
  borderRadius: 4,
  border: '1px solid var(--interactive-accent)',
  backgroundColor: 'transparent',
  fontFamily: 'var(--font-ui, sans-serif)',
  fontSize: 12,
  cursor: 'pointer',
};

const cancelBtnStyle: React.CSSProperties = {
  padding: '3px 10px',
  borderRadius: 4,
  backgroundColor: 'transparent',
  fontFamily: 'var(--font-ui, sans-serif)',
  fontSize: 12,
  cursor: 'pointer',
};

function hasNewlines(text: string): boolean {
  return text.includes('\n') || text.includes('\r');
}

function formatLineCount(text: string): string {
  const lines = text.split(/\r?\n/).length;
  return lines > 1 ? ` (${lines} lines)` : '';
}

export function PasteConfirmBanner({
  text,
  onConfirm,
  onConfirmSingleLine,
  onCancel,
}: PasteConfirmBannerProps): React.ReactElement {
  const multiline = hasNewlines(text);

  return (
    <div
      className="bg-surface-panel text-text-semantic-primary border-t border-border-semantic"
      style={bannerStyle}
    >
      <span className="text-text-semantic-muted" style={{ flex: 1 }}>
        Paste {text.length.toLocaleString()} characters{formatLineCount(text)}?
      </span>
      <button
        onClick={onConfirm}
        autoFocus
        className="text-text-semantic-on-accent"
        style={confirmBtnStyle}
      >
        Paste
      </button>
      {multiline && (
        <button
          onClick={onConfirmSingleLine}
          className="text-interactive-accent"
          style={singleLineBtnStyle}
        >
          Single line
        </button>
      )}
      <button
        onClick={onCancel}
        className="border border-border-semantic text-text-semantic-muted"
        style={cancelBtnStyle}
      >
        Cancel
      </button>
    </div>
  );
}
