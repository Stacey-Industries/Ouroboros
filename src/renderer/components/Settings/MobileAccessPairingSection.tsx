/**
 * MobileAccessPairingSection.tsx — Generate pairing code + QR display.
 *
 * Wave 33a Phase G. Shows a 6-digit pairing code, a 60-second countdown,
 * and a QR code encoding the full qrPayload JSON blob. Uses QRCodeSVG from
 * qrcode.react (newly installed dep — not previously present).
 */

import { QRCodeSVG } from 'qrcode.react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import type { GeneratePairingCodeResult, QrPayload } from '../../types/electron-mobile-access';
import { SectionLabel } from './settingsStyles';

// ── Types ────────────────────────────────────────────────────────────────────

interface PairingState {
  code: string;
  qrPayload: QrPayload;
  expiresAt: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const QR_SIZE = 200;
const TICK_MS = 1000;

// ── usePairingGenerator ───────────────────────────────────────────────────────

interface PairingGeneratorResult {
  pairing: PairingState | null;
  loading: boolean;
  error: string | null;
  generate: () => Promise<void>;
  setExpiredState: () => void;
}

function usePairingGenerator(): PairingGeneratorResult {
  const [pairing, setPairing] = useState<PairingState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result: GeneratePairingCodeResult =
        await window.electronAPI.mobileAccess.generatePairingCode();
      if (result.success && result.code && result.expiresAt && result.qrPayload) {
        setPairing({ code: result.code, qrPayload: result.qrPayload, expiresAt: result.expiresAt });
      } else {
        setError(result.error ?? 'Failed to generate pairing code');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Keep pairing visible but mark it expired so the UI can show an expired notice.
  const setExpiredState = useCallback(() => {
    setPairing((prev) => prev ? { ...prev, expiresAt: 0 } : null);
  }, []);

  return { pairing, loading, error, generate, setExpiredState };
}

// ── CountdownDisplay ─────────────────────────────────────────────────────────

interface CountdownProps {
  expiresAt: number;
  onExpired: () => void;
}

function CountdownDisplay({ expiresAt, onExpired }: CountdownProps): React.ReactElement {
  const [secsLeft, setSecsLeft] = useState(() =>
    Math.max(0, Math.ceil((expiresAt - Date.now()) / TICK_MS)),
  );
  const onExpiredRef = useRef(onExpired);
  onExpiredRef.current = onExpired;

  useEffect(() => {
    const id = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / TICK_MS));
      setSecsLeft(remaining);
      if (remaining === 0) {
        clearInterval(id);
        onExpiredRef.current();
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [expiresAt]);

  return (
    <span
      className={secsLeft <= 10 ? 'text-status-error' : 'text-text-semantic-muted'}
      style={{ fontSize: '12px' }}
    >
      {secsLeft > 0 ? `Expires in ${secsLeft}s` : 'Expired'}
    </span>
  );
}

// ── QrBlock ──────────────────────────────────────────────────────────────────

function QrBlock({ payload }: { payload: QrPayload }): React.ReactElement {
  const payloadJson = JSON.stringify(payload);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
      <QRCodeSVG
        bgColor="var(--surface-panel)"
        fgColor="var(--text-primary)"
        size={QR_SIZE}
        value={payloadJson}
      />
      <span aria-label="QR code payload JSON" className="sr-only">
        {payloadJson}
      </span>
    </div>
  );
}

// ── PairingDisplay ───────────────────────────────────────────────────────────

interface PairingDisplayProps {
  pairing: PairingState;
  onExpired: () => void;
}

function PairingDisplay({ pairing, onExpired }: PairingDisplayProps): React.ReactElement {
  return (
    <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'flex-start' }}>
      <span
        aria-label="Pairing code"
        style={{ fontFamily: 'var(--font-mono)', fontSize: '32px', fontWeight: 700, letterSpacing: '0.2em', color: 'var(--text-primary)' }}
      >
        {pairing.code}
      </span>
      <CountdownDisplay expiresAt={pairing.expiresAt} onExpired={onExpired} />
      <QrBlock payload={pairing.qrPayload} />
    </div>
  );
}

// ── PairingSectionBody ────────────────────────────────────────────────────────

interface SectionBodyProps {
  enabled: boolean;
  pairing: PairingState | null;
  loading: boolean;
  error: string | null;
  onGenerate: () => void;
  onExpired: () => void;
}

function PairingSectionBody({ enabled, pairing, loading, error, onGenerate, onExpired }: SectionBodyProps): React.ReactElement {
  const isDisabled = !enabled || loading;
  const isExpired = pairing !== null && pairing.expiresAt === 0;
  const label = loading ? 'Generating…' : pairing && !isExpired ? 'Regenerate' : 'Generate Pairing Code';
  return (
    <>
      <button disabled={isDisabled} onClick={onGenerate} style={generateBtnStyle(isDisabled)} type="button">
        {label}
      </button>
      {error && <p className="text-status-error" style={{ fontSize: '12px', marginTop: '8px' }}>{error}</p>}
      {pairing && !isExpired && <PairingDisplay pairing={pairing} onExpired={onExpired} />}
      {isExpired && <p className="text-text-semantic-muted" style={{ fontSize: '12px', marginTop: '12px' }}>Expired — regenerate to create a new code.</p>}
    </>
  );
}

// ── MobileAccessPairingSection ───────────────────────────────────────────────

export function MobileAccessPairingSection({ enabled }: { enabled: boolean }): React.ReactElement {
  const { pairing, loading, error, generate, setExpiredState } = usePairingGenerator();

  return (
    <section aria-labelledby="pairing-section-label">
      <div id="pairing-section-label"><SectionLabel>Pairing Code</SectionLabel></div>
      <p className="text-text-semantic-muted" style={{ fontSize: '12px', marginBottom: '12px' }}>
        Scan the QR code or enter the 6-digit code on your mobile device to pair it.
      </p>
      <PairingSectionBody
        enabled={enabled}
        error={error}
        loading={loading}
        pairing={pairing}
        onExpired={setExpiredState}
        onGenerate={() => void generate()}
      />
    </section>
  );
}

// ── Style helpers ─────────────────────────────────────────────────────────────

function generateBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '10px 16px',
    minHeight: '44px',
    borderRadius: '6px',
    border: '1px solid var(--border-default)',
    background: disabled ? 'var(--surface-raised)' : 'var(--interactive-accent)',
    color: disabled ? 'var(--text-muted)' : 'var(--text-on-accent)',
    fontSize: '13px',
    fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  };
}
