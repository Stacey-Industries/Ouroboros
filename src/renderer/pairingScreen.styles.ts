/**
 * pairingScreen.styles.ts — Inline style constants for PairingScreen.
 *
 * DESIGN TOKEN EXCEPTION: All colors are hardcoded intentionally. This screen
 * renders BEFORE the main app bootstraps (before tokens.css initializes), so
 * design tokens are unavailable. See .claude/rules/renderer.md for the
 * documented exception covering pre-token-system renders.
 *
 * Wave 33a Phase H / Wave 33b Phase E.
 */

/** Duration the prefill highlight border is visible after a deep-link prefill. */
export const PREFILL_HIGHLIGHT_MS = 2000;

/**
 * Border style applied to the code input when fields are prefilled via deep link.
 * Hardcoded hex — pre-token-system render, see file-level exception above.
 */
export const FIELD_HIGHLIGHT_BORDER = '1px solid #388bfd'; // hardcoded: pre-token-system render — accent blue for deep-link prefill highlight

// All colors below are intentional — pre-token-system render (see above).
export const S = {
  root: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0d1117', // hardcoded: pre-token-system render
    fontFamily: 'system-ui, -apple-system, sans-serif',
    padding: '16px',
  },
  card: {
    width: '100%',
    maxWidth: '360px',
    background: '#161b22', // hardcoded: pre-token-system render
    border: '1px solid #30363d', // hardcoded: pre-token-system render
    borderRadius: '12px',
    padding: '32px 28px',
  },
  wordmark: {
    fontSize: '13px',
    fontWeight: 600,
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
    color: '#8b949e', // hardcoded: pre-token-system render
    marginBottom: '6px',
  },
  heading: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#e6edf3', // hardcoded: pre-token-system render
    margin: '0 0 4px',
  },
  sub: {
    fontSize: '13px',
    color: '#8b949e', // hardcoded: pre-token-system render
    margin: '0 0 24px',
  },
  label: {
    display: 'block',
    fontSize: '12px',
    fontWeight: 500,
    color: '#8b949e', // hardcoded: pre-token-system render
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    marginBottom: '6px',
  },
  field: {
    width: '100%',
    padding: '8px 12px',
    background: '#0d1117', // hardcoded: pre-token-system render
    border: '1px solid #30363d', // hardcoded: pre-token-system render
    borderRadius: '6px',
    color: '#e6edf3', // hardcoded: pre-token-system render
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box' as const,
    fontFamily: 'monospace',
    letterSpacing: '0.2em',
    marginBottom: '16px',
  },
  fieldReadonly: { opacity: 0.7 },
  button: {
    width: '100%',
    padding: '10px',
    background: '#238636', // hardcoded: pre-token-system render
    color: '#fff', // hardcoded: pre-token-system render
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '4px',
  },
  buttonDisabled: { opacity: 0.6, cursor: 'not-allowed' as const },
  error: {
    marginTop: '12px',
    padding: '10px 12px',
    background: '#1c0912', // hardcoded: pre-token-system render
    border: '1px solid #6e1a2f', // hardcoded: pre-token-system render
    borderRadius: '6px',
    color: '#f85149', // hardcoded: pre-token-system render
    fontSize: '13px',
  },
  spinner: {
    display: 'inline-block',
    width: '14px',
    height: '14px',
    border: '2px solid rgba(255,255,255,0.3)', // hardcoded: pre-token-system render
    borderTopColor: '#fff', // hardcoded: pre-token-system render
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
    marginRight: '8px',
    verticalAlign: 'middle',
  },
} as const;
