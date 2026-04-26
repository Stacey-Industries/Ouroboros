import React from 'react';

import { isNative } from '../web/capacitor/index';
import { FIELD_HIGHLIGHT_BORDER, S } from './pairingScreen.styles';

export interface PairingFormProps {
  code: string;
  label: string;
  loading: boolean;
  displayHost: string;
  highlight: boolean;
  codeRef: React.RefObject<HTMLInputElement | null>;
  onCodeChange: (v: string) => void;
  onLabelChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

interface CodeInputProps {
  code: string;
  disabled: boolean;
  highlight: boolean;
  codeRef: React.RefObject<HTMLInputElement | null>;
  onChange: (v: string) => void;
}

function CodeInput({ code, disabled, highlight, codeRef, onChange }: CodeInputProps): React.ReactElement {
  const fieldStyle = highlight ? { ...S.field, border: FIELD_HIGHLIGHT_BORDER } : S.field;
  return (
    <>
      <label style={S.label} htmlFor="pair-code">
        Pairing code
      </label>
      <input
        ref={codeRef}
        id="pair-code"
        style={fieldStyle}
        type="text"
        inputMode="numeric"
        pattern="\d{6}"
        maxLength={6}
        placeholder="000000"
        value={code}
        autoComplete="one-time-code"
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        disabled={disabled}
        required
      />
    </>
  );
}

function PairingHostField({ displayHost }: { displayHost: string }): React.ReactElement {
  return (
    <>
      <label style={S.label} htmlFor="pair-host">
        Host
      </label>
      <input
        id="pair-host"
        style={{ ...S.field, ...S.fieldReadonly }}
        value={displayHost}
        readOnly
        tabIndex={-1}
      />
    </>
  );
}

function PairingLabelField({
  label,
  disabled,
  onChange,
}: {
  label: string;
  disabled: boolean;
  onChange: (v: string) => void;
}): React.ReactElement {
  return (
    <>
      <label style={S.label} htmlFor="pair-label">
        Device name (optional)
      </label>
      <input
        id="pair-label"
        style={{ ...S.field, letterSpacing: 'normal' }}
        type="text"
        maxLength={64}
        placeholder="Mobile device"
        value={label}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </>
  );
}

function PairingSubmitButton({ loading }: { loading: boolean }): React.ReactElement {
  return (
    <button
      type="submit"
      style={loading ? { ...S.button, ...S.buttonDisabled } : S.button}
      disabled={loading}
    >
      {loading && <span style={S.spinner} aria-hidden="true" />}
      {loading ? 'Pairing\u2026' : 'Pair'}
    </button>
  );
}

export function PairingForm({
  code,
  label,
  loading,
  displayHost,
  highlight,
  codeRef,
  onCodeChange,
  onLabelChange,
  onSubmit,
}: PairingFormProps): React.ReactElement {
  return (
    <form onSubmit={onSubmit}>
      <PairingHostField displayHost={displayHost} />
      <CodeInput
        codeRef={codeRef}
        code={code}
        disabled={loading}
        highlight={highlight}
        onChange={onCodeChange}
      />
      <PairingLabelField label={label} disabled={loading} onChange={onLabelChange} />
      <PairingSubmitButton loading={loading} />
    </form>
  );
}

interface ScanQrButtonProps {
  isScanning: boolean;
  onScan: () => void;
}

function ScanQrButton({ isScanning, onScan }: ScanQrButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      style={isScanning ? { ...S.scanButton, ...S.buttonDisabled } : S.scanButton}
      disabled={isScanning}
      onClick={onScan}
      aria-label="Scan QR code"
    >
      {isScanning ? 'Opening scanner\u2026' : 'Scan QR code'}
    </button>
  );
}

interface PairingCardProps {
  formProps: PairingFormProps;
  isScanning: boolean;
  displayError: string;
  onScan: () => void;
}

export function PairingCard({ formProps, isScanning, displayError, onScan }: PairingCardProps): React.ReactElement {
  return (
    <div style={S.card}>
      <div style={S.wordmark}>Ouroboros</div>
      <h1 style={S.heading}>Pair this device</h1>
      <p style={S.sub}>
        Enter the 6-digit code shown in Desktop &rarr; Settings &rarr; Mobile Access.
      </p>
      <PairingForm {...formProps} />
      {isNative() && <ScanQrButton isScanning={isScanning} onScan={onScan} />}
      {displayError && (
        <div style={S.error} role="alert">
          {displayError}
        </div>
      )}
    </div>
  );
}
