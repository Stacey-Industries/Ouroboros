/**
 * SystemPromptViewer.tsx — Read-only pre-formatted display of a system prompt.
 *
 * Wave 37 Phase A. Shows the resolved system prompt text with a
 * copy-to-clipboard button.  Design tokens only — no hardcoded colors.
 */

import React, { useCallback, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SystemPromptViewerProps {
  text: string;
  capturedAt: number;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  position: 'relative',
  marginTop: '8px',
};

const preStyle: React.CSSProperties = {
  margin: 0,
  padding: '12px',
  borderRadius: '6px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-inset)',
  fontFamily: 'var(--font-mono)',
  fontSize: '12px',
  lineHeight: 1.6,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  overflowY: 'auto',
  maxHeight: '400px',
  color: 'var(--text-primary)',
};

const metaStyle: React.CSSProperties = {
  marginTop: '6px',
  fontSize: '11px',
  color: 'var(--text-muted)',
};

const copyButtonStyle: React.CSSProperties = {
  position: 'absolute',
  top: '8px',
  right: '8px',
  padding: '3px 10px',
  borderRadius: '4px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-raised)',
  color: 'var(--text-secondary)',
  fontSize: '11px',
  cursor: 'pointer',
  fontFamily: 'var(--font-ui)',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function SystemPromptViewer({
  text,
  capturedAt,
}: SystemPromptViewerProps): React.ReactElement {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API may be blocked in some contexts — fail silently.
    }
  }, [text]);

  const capturedLabel = new Date(capturedAt).toLocaleTimeString();

  return (
    <div style={containerStyle}>
      <pre style={preStyle}>{text}</pre>
      <button
        aria-label="Copy system prompt to clipboard"
        onClick={handleCopy}
        style={copyButtonStyle}
        type="button"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <p style={metaStyle}>Captured at {capturedLabel} (first turn of session)</p>
    </div>
  );
}
