/**
 * qrScanner.ts — Native QR/barcode scanner bridge for the pairing screen.
 *
 * Uses @capacitor-mlkit/barcode-scanning (v6.2.0, Capacitor 6 compatible).
 * Dynamic import keeps MLKit out of the web bundle entirely.
 *
 * Wave 33b Phase F.
 */

import type { PairingLinkPayload } from './deepLinks';
import { parsePairingUrl } from './deepLinks';
import { isNative } from './index';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScanOutcome =
  | { kind: 'success'; payload: PairingLinkPayload; rawValue: string }
  | { kind: 'unsupported' }
  | { kind: 'denied' }
  | { kind: 'cancelled' }
  | { kind: 'invalid-format'; rawValue: string }
  | { kind: 'error'; message: string };

export type CameraPermissionResult = 'granted' | 'denied' | 'restricted';

// ─── Permission helper ────────────────────────────────────────────────────────

/**
 * Requests camera permission on native platforms.
 * Returns 'granted', 'denied', or 'restricted'.
 * On web/browser always returns 'denied' (unsupported).
 */
export async function ensureCameraPermission(): Promise<CameraPermissionResult> {
  if (!isNative()) return 'denied';
  try {
    const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning');
    const status = await BarcodeScanner.requestPermissions();
    const state = status.camera;
    if (state === 'granted' || state === 'limited') return 'granted';
    if (state === 'denied') return 'denied';
    return 'restricted';
  } catch {
    return 'denied';
  }
}

// ─── Core scan logic (extracted for line-limit compliance) ────────────────────

interface ScannerModule {
  BarcodeScanner: {
    requestPermissions(): Promise<{ camera: string }>;
    scan(opts: { formats: string[] }): Promise<{ barcodes: Array<{ rawValue: string }> }>;
  };
  BarcodeFormat: { QrCode: string };
}

async function importScanner(): Promise<ScannerModule> {
  return import('@capacitor-mlkit/barcode-scanning') as Promise<ScannerModule>;
}

function mapPermission(state: string): 'granted' | 'denied' {
  return state === 'granted' || state === 'limited' ? 'granted' : 'denied';
}

function parseBarcode(rawValue: string): ScanOutcome {
  const payload = parsePairingUrl(rawValue);
  if (payload) return { kind: 'success', payload, rawValue };
  return { kind: 'invalid-format', rawValue };
}

async function runScan(mod: ScannerModule): Promise<ScanOutcome> {
  const { BarcodeScanner, BarcodeFormat } = mod;
  const permStatus = await BarcodeScanner.requestPermissions();
  if (mapPermission(permStatus.camera) === 'denied') return { kind: 'denied' };

  const result = await BarcodeScanner.scan({ formats: [BarcodeFormat.QrCode] });
  if (!result.barcodes.length) return { kind: 'cancelled' };

  const first = result.barcodes[0];
  if (!first) return { kind: 'cancelled' };
  return parseBarcode(first.rawValue);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Launches the native QR scanner and resolves with a typed ScanOutcome.
 *
 * In browser mode returns { kind: 'unsupported' } immediately.
 * Never throws — all errors are captured as { kind: 'error', message }.
 */
export async function scanPairingQr(): Promise<ScanOutcome> {
  if (!isNative()) return { kind: 'unsupported' };
  try {
    const mod = await importScanner();
    return await runScan(mod);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown scanner error';
    return { kind: 'error', message };
  }
}
