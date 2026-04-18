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
 * Wave 33a Phase H / Wave 33b Phase E (deep-link prefill).
 */

import React, { FormEvent, useCallback, useEffect, useRef, useState } from 'react';

import { initDeepLinkListener, readPairingQueryParams } from '../web/capacitor/deepLinks';
import { getDeviceFingerprint, setRefreshToken } from '../web/tokenStorage';
import { FIELD_HIGHLIGHT_BORDER, PREFILL_HIGHLIGHT_MS, S } from './pairingScreen.styles';

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
  highlight: boolean;
  codeRef: React.RefObject<HTMLInputElement | null>;
  onCodeChange: (v: string) => void;
  onLabelChange: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
}

// ─── usePrefill ───────────────────────────────────────────────────────────────

/**
 * On mount, reads URL query params for pairing fields and subscribes to the
 * native deep-link listener. Calls setters when a payload is received.
 * Does NOT auto-submit — security requirement from Phase H plan.
 */
function usePrefill(
  setCode: (v: string) => void,
  setHighlight: (v: boolean) => void,
): void {
  const setCodeRef = useRef(setCode);
  const setHighlightRef = useRef(setHighlight);
  setCodeRef.current = setCode;
  setHighlightRef.current = setHighlight;

  useEffect(() => {
    let deepLinkCleanup: (() => void) | null = null;
    let highlightTimer: ReturnType<typeof setTimeout> | null = null;

    function applyPrefill(code: string): void {
      setCodeRef.current(code);
      setHighlightRef.current(true);
      highlightTimer = setTimeout(() => setHighlightRef.current(false), PREFILL_HIGHLIGHT_MS);
    }

    // Browser / web-mode: check URL query params on mount.
    const queryPayload = readPairingQueryParams(window.location.search);
    if (queryPayload) applyPrefill(queryPayload.code);

    // Native: subscribe to deep-link open events at runtime.
    void initDeepLinkListener((payload) => {
      applyPrefill(payload.code);
    }).then((cleanup) => { deepLinkCleanup = cleanup; });

    return () => {
      deepLinkCleanup?.();
      if (highlightTimer !== null) clearTimeout(highlightTimer);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- setters are stable refs
}

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

function CodeInput({ codeRef, value, disabled, highlight, onChange }: {
  codeRef: React.RefObject<HTMLInputElement | null>;
  value: string; disabled: boolean;
  highlight: boolean;
  onChange: (v: string) => void;
}): React.ReactElement {
  const fieldStyle = highlight
    ? { ...S.field, border: FIELD_HIGHLIGHT_BORDER }
    : S.field;
  return (
    <>
      <label style={S.label} htmlFor="pair-code">Pairing code</label>
      <input
        ref={codeRef}
        id="pair-code"
        style={fieldStyle}
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
  const { code, label, loading, displayHost, highlight, codeRef, onCodeChange, onLabelChange, onSubmit } = props;
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
      <CodeInput codeRef={codeRef} value={code} disabled={loading} highlight={highlight} onChange={onCodeChange} />
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

// ─── Root state hook ──────────────────────────────────────────────────────────

interface ScreenState {
  code: string; setCode: (v: string) => void;
  label: string; setLabel: (v: string) => void;
  highlight: boolean;
  fingerprint: string;
  codeRef: React.RefObject<HTMLInputElement | null>;
}

function usePairingScreenState(): ScreenState {
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('Mobile device');
  const [fingerprint, setFingerprint] = useState('');
  const [highlight, setHighlight] = useState(false);
  const codeRef = useRef<HTMLInputElement | null>(null);
  usePrefill(setCode, setHighlight);
  useEffect(() => { codeRef.current?.focus(); }, []);
  useEffect(() => {
    getDeviceFingerprint()
      .then(setFingerprint)
      .catch(() => { setFingerprint('unknown'); });
  }, []);
  return { code, setCode, label, setLabel, highlight, fingerprint, codeRef };
}

// ─── Root component ────────────────────────────────────────────────────────────

export function PairingScreen({ host, port }: PairingScreenProps): React.ReactElement {
  const { code, setCode, label, setLabel, highlight, fingerprint, codeRef } = usePairingScreenState();
  const { loading, errorMsg, handleSubmit } = usePairingSubmit(code, label, fingerprint);
  const displayHost = port && port !== 80 && port !== 443 ? `${host}:${port}` : host;
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
          highlight={highlight}
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
