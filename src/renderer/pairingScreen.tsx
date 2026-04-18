/**
 * pairingScreen.tsx — Minimal pairing UI for mobile first-connect flow.
 *
 * DESIGN TOKEN EXCEPTION: This component uses hardcoded hex colors intentionally.
 * It renders BEFORE the main app bootstraps (before tokens.css initializes), so
 * design tokens are unavailable. See .claude/rules/renderer.md for the documented
 * exception covering pre-token-system renders.
 *
 * Bundle target: < 12 KB gzipped (shipped inside main bundle per Wave 33a plan).
 *
 * Wave 33a Phase H.
 */

import React, { FormEvent, useCallback, useEffect, useRef, useState } from 'react';

import { getDeviceFingerprint, setRefreshToken } from '../web/tokenStorage';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PairResponse {
  refreshToken: string;
  deviceId: string;
  capabilities: string[];
}

interface PairingScreenProps {
  host: string;
  port: number;
}

interface PairingFormProps {
  code: string;
  label: string;
  loading: boolean;
  displayHost: string;
  codeRef: React.RefObject<HTMLInputElement | null>;
  onCodeChange: (v: string) => void;
  onLabelChange: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Token storage is handled by tokenStorage.ts (Keychain/Keystore on native, localStorage on web).

// ─── Styles ──────────────────────────────────────────────────────────────────

// All colors below are intentional — this screen renders before the token system
// initialises (see file-level DESIGN TOKEN EXCEPTION comment above).
const S = {
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

// ─── Error message normalizer ─────────────────────────────────────────────────

export function humanizeError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes('rate') || lower.includes('429')) {
    return 'Too many attempts — wait a minute and try again.';
  }
  if (lower.includes('expired')) return 'Code has expired. Generate a new code on the desktop.';
  if (lower.includes('invalid') || lower.includes('401')) {
    return 'Invalid code. Double-check and try again.';
  }
  return raw;
}

// ─── Submit logic hook ────────────────────────────────────────────────────────

interface UseSubmitResult {
  loading: boolean;
  errorMsg: string;
  handleSubmit: (e: FormEvent) => void;
}

interface SubmitPairingOpts {
  code: string;
  label: string;
  fingerprint: string;
  setErrorMsg: (m: string) => void;
  setLoading: (v: boolean) => void;
}

function usePairingSubmit(
  code: string,
  label: string,
  fingerprint: string,
): UseSubmitResult {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (loading || !fingerprint) return;

      const trimmed = code.replace(/\s/g, '');
      if (trimmed.length !== 6 || !/^\d{6}$/.test(trimmed)) {
        setErrorMsg('Enter a 6-digit code.');
        return;
      }

      setLoading(true);
      setErrorMsg('');
      void submitPairing({ code: trimmed, label, fingerprint, setErrorMsg, setLoading });
    },
    [code, label, fingerprint, loading],
  );

  return { loading, errorMsg, handleSubmit };
}

async function submitPairing(opts: SubmitPairingOpts): Promise<void> {
  const { code, label, fingerprint, setErrorMsg, setLoading } = opts;
  const body = JSON.stringify({ code, label: label.trim() || 'Mobile device', fingerprint });
  try {
    const res = await fetch('/api/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      credentials: 'same-origin',
    });
    const json = (await res.json()) as Partial<PairResponse> & { error?: string };
    if (!res.ok || !json.refreshToken) {
      setErrorMsg(json.error ?? `HTTP ${res.status}`);
      return;
    }
    await setRefreshToken(json.refreshToken);
    window.location.reload();
  } catch (err) {
    setErrorMsg(err instanceof Error ? err.message : 'Network error — check your connection.');
  } finally {
    setLoading(false);
  }
}

// ─── Pairing form sub-components ─────────────────────────────────────────────

function CodeInput({ codeRef, value, disabled, onChange }: {
  codeRef: React.RefObject<HTMLInputElement | null>;
  value: string; disabled: boolean;
  onChange: (v: string) => void;
}): React.ReactElement {
  return (
    <>
      <label style={S.label} htmlFor="pair-code">Pairing code</label>
      <input
        ref={codeRef}
        id="pair-code"
        style={S.field}
        type="text"
        inputMode="numeric"
        pattern="\d{6}"
        maxLength={6}
        placeholder="000000"
        value={value}
        autoComplete="one-time-code"
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        disabled={disabled}
        required
      />
    </>
  );
}

function PairingForm(props: PairingFormProps): React.ReactElement {
  const { code, label, loading, displayHost, codeRef, onCodeChange, onLabelChange, onSubmit } = props;
  return (
    <form onSubmit={onSubmit}>
      <label style={S.label} htmlFor="pair-host">Host</label>
      <input
        id="pair-host"
        style={{ ...S.field, ...S.fieldReadonly }}
        value={displayHost}
        readOnly
        tabIndex={-1}
      />
      <CodeInput codeRef={codeRef} value={code} disabled={loading} onChange={onCodeChange} />
      <label style={S.label} htmlFor="pair-label">Device name (optional)</label>
      <input
        id="pair-label"
        style={{ ...S.field, letterSpacing: 'normal' }}
        type="text"
        maxLength={64}
        placeholder="Mobile device"
        value={label}
        onChange={(e) => onLabelChange(e.target.value)}
        disabled={loading}
      />
      <button
        type="submit"
        style={loading ? { ...S.button, ...S.buttonDisabled } : S.button}
        disabled={loading}
      >
        {loading && <span style={S.spinner} aria-hidden="true" />}
        {loading ? 'Pairing\u2026' : 'Pair'}
      </button>
    </form>
  );
}

// ─── Root component ────────────────────────────────────────────────────────────

export function PairingScreen({ host, port }: PairingScreenProps): React.ReactElement {
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('Mobile device');
  const [fingerprint, setFingerprint] = useState('');
  const codeRef = useRef<HTMLInputElement | null>(null);
  const { loading, errorMsg, handleSubmit } = usePairingSubmit(code, label, fingerprint);

  useEffect(() => { codeRef.current?.focus(); }, []);

  useEffect(() => {
    getDeviceFingerprint()
      .then(setFingerprint)
      .catch(() => { setFingerprint('unknown'); });
  }, []);

  const displayHost = port && port !== 80 && port !== 443 ? `${host}:${port}` : host;
  // Disable the form while fingerprint hasn't resolved yet (async storage read)
  const formBusy = loading || fingerprint === '';

  return (
    <div style={S.root}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={S.card}>
        <div style={S.wordmark}>Ouroboros</div>
        <h1 style={S.heading}>Pair this device</h1>
        <p style={S.sub}>
          Enter the 6-digit code shown in Desktop &rarr; Settings &rarr; Mobile Access.
        </p>
        <PairingForm
          code={code}
          label={label}
          loading={formBusy}
          displayHost={displayHost}
          codeRef={codeRef}
          onCodeChange={setCode}
          onLabelChange={setLabel}
          onSubmit={handleSubmit}
        />
        {errorMsg && (
          <div style={S.error} role="alert">{humanizeError(errorMsg)}</div>
        )}
      </div>
    </div>
  );
}
