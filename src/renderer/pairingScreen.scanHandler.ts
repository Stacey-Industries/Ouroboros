/**
 * pairingScreen.scanHandler.ts — Outcome dispatcher for the QR scanner result.
 *
 * Extracted from pairingScreen.tsx to keep that file under the 300-line ESLint
 * limit after the Phase F "Scan QR" button additions.
 *
 * Wave 33b Phase F.
 */

import type { PairingLinkPayload } from '../web/capacitor/deepLinks';
import type { ScanOutcome } from '../web/capacitor/qrScanner';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScanOutcomeSetters {
  setCode: (v: string) => void;
  setHighlight: (v: boolean) => void;
  setErrorMsg: (v: string) => void;
  setIsScanning: (v: boolean) => void;
  highlightTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
}

// ─── Highlight helper ─────────────────────────────────────────────────────────

const SCAN_HIGHLIGHT_MS = 2000;

function applyHighlight(setters: ScanOutcomeSetters): void {
  const { setHighlight, highlightTimeoutRef } = setters;
  if (highlightTimeoutRef.current !== null) {
    clearTimeout(highlightTimeoutRef.current);
  }
  setHighlight(true);
  highlightTimeoutRef.current = setTimeout(
    () => setHighlight(false),
    SCAN_HIGHLIGHT_MS,
  );
}

// ─── Per-outcome handlers (extracted for complexity limit) ────────────────────

function handleSuccess(
  payload: PairingLinkPayload,
  setters: ScanOutcomeSetters,
): void {
  const { setCode, setErrorMsg } = setters;
  setCode(payload.code);
  setErrorMsg('');
  applyHighlight(setters);
}

function handleDenied(setters: ScanOutcomeSetters): void {
  setters.setErrorMsg('Camera permission required to scan.');
}

function handleInvalidFormat(setters: ScanOutcomeSetters): void {
  setters.setErrorMsg("That QR code isn't a valid pairing link.");
}

function handleError(message: string, setters: ScanOutcomeSetters): void {
  setters.setErrorMsg(message);
}

// ─── Public builder ───────────────────────────────────────────────────────────

/**
 * Returns a callback that dispatches a ScanOutcome to the appropriate setters.
 *
 * - success    → fills code field + triggers highlight (no auto-submit)
 * - denied     → shows inline permission error
 * - cancelled  → silently dismissed
 * - invalid-format → shows format error
 * - error      → shows the error message
 * - unsupported → no-op (button hidden in browser mode anyway)
 */
export function buildScanOutcomeHandler(
  setters: ScanOutcomeSetters,
): (outcome: ScanOutcome) => void {
  return (outcome: ScanOutcome) => {
    setters.setIsScanning(false);
    switch (outcome.kind) {
      case 'success':
        handleSuccess(outcome.payload, setters);
        break;
      case 'denied':
        handleDenied(setters);
        break;
      case 'cancelled':
        // Silently dismiss — no error shown
        break;
      case 'invalid-format':
        handleInvalidFormat(setters);
        break;
      case 'error':
        handleError(outcome.message, setters);
        break;
      case 'unsupported':
        // Button is only rendered on native — this branch should never fire
        break;
      default: {
        // Exhaustiveness guard
        const _never: never = outcome;
        void _never;
      }
    }
  };
}
