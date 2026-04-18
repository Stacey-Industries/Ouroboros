/**
 * qrScanner.test.ts — Unit tests for the native QR scanner bridge.
 *
 * Wave 33b Phase F.
 *
 * @capacitor-mlkit/barcode-scanning is mocked via vi.mock so no native runtime
 * is loaded. isNative() is mocked via vi.mock('./index') — same pattern used in
 * deepLinks.test.ts. vi.hoisted() is used (Phase C lesson) so mock factories
 * resolve before any static imports execute.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  isNative: vi.fn(() => false),
  requestPermissions: vi.fn(async () => ({ camera: 'granted' })),
  scan: vi.fn(async () => ({ barcodes: [] as Array<{ rawValue: string }> })),
}));

vi.mock('./index', () => ({
  isNative: () => mocks.isNative(),
}));

type ScanOpts = { formats: string[] };
vi.mock('@capacitor-mlkit/barcode-scanning', () => ({
  BarcodeScanner: {
    requestPermissions: () => mocks.requestPermissions(),
    // Forward opts so toHaveBeenCalledWith assertions can inspect formats
    scan: (opts: ScanOpts) => (mocks.scan as (o: ScanOpts) => unknown)(opts),
  },
  BarcodeFormat: { QrCode: 'QR_CODE' },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { ensureCameraPermission, scanPairingQr } from './qrScanner';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_QR = 'ouroboros://pair?host=192.168.1.50&port=4173&code=123456&fingerprint=fp-abc';
const INVALID_QR = 'https://example.com/not-a-pairing-link';

// ─── Setup / teardown ─────────────────────────────────────────────────────────

afterEach(() => { vi.clearAllMocks(); });

// ─── scanPairingQr — browser mode ─────────────────────────────────────────────

describe('scanPairingQr — browser mode (!isNative)', () => {
  beforeEach(() => { mocks.isNative.mockReturnValue(false); });

  it('returns { kind: "unsupported" } immediately', async () => {
    const result = await scanPairingQr();
    expect(result.kind).toBe('unsupported');
  });

  it('does not call BarcodeScanner', async () => {
    await scanPairingQr();
    expect(mocks.requestPermissions).not.toHaveBeenCalled();
    expect(mocks.scan).not.toHaveBeenCalled();
  });
});

// ─── scanPairingQr — native, permission denied ─────────────────────────────────

describe('scanPairingQr — native, permission denied', () => {
  beforeEach(() => {
    mocks.isNative.mockReturnValue(true);
    mocks.requestPermissions.mockResolvedValue({ camera: 'denied' });
  });

  it('returns { kind: "denied" }', async () => {
    const result = await scanPairingQr();
    expect(result.kind).toBe('denied');
  });

  it('does not call BarcodeScanner.scan', async () => {
    await scanPairingQr();
    expect(mocks.scan).not.toHaveBeenCalled();
  });
});

// ─── scanPairingQr — native, permission granted, user cancels ─────────────────

describe('scanPairingQr — native, user cancels (empty barcodes)', () => {
  beforeEach(() => {
    mocks.isNative.mockReturnValue(true);
    mocks.requestPermissions.mockResolvedValue({ camera: 'granted' });
    mocks.scan.mockResolvedValue({ barcodes: [] });
  });

  it('returns { kind: "cancelled" }', async () => {
    const result = await scanPairingQr();
    expect(result.kind).toBe('cancelled');
  });
});

// ─── scanPairingQr — native, valid QR ────────────────────────────────────────

describe('scanPairingQr — native, valid pairing QR scanned', () => {
  beforeEach(() => {
    mocks.isNative.mockReturnValue(true);
    mocks.requestPermissions.mockResolvedValue({ camera: 'granted' });
    mocks.scan.mockResolvedValue({ barcodes: [{ rawValue: VALID_QR }] });
  });

  it('returns { kind: "success" } with parsed payload', async () => {
    const result = await scanPairingQr();
    expect(result.kind).toBe('success');
    if (result.kind !== 'success') return;
    expect(result.payload).toEqual({
      host: '192.168.1.50',
      port: '4173',
      code: '123456',
      fingerprint: 'fp-abc',
    });
    expect(result.rawValue).toBe(VALID_QR);
  });

  it('passes QrCode format to BarcodeScanner.scan', async () => {
    await scanPairingQr();
    expect(mocks.scan).toHaveBeenCalledWith({ formats: ['QR_CODE'] });
  });
});

// ─── scanPairingQr — native, invalid QR format ───────────────────────────────

describe('scanPairingQr — native, non-pairing QR scanned', () => {
  beforeEach(() => {
    mocks.isNative.mockReturnValue(true);
    mocks.requestPermissions.mockResolvedValue({ camera: 'granted' });
    mocks.scan.mockResolvedValue({ barcodes: [{ rawValue: INVALID_QR }] });
  });

  it('returns { kind: "invalid-format" } with rawValue', async () => {
    const result = await scanPairingQr();
    expect(result.kind).toBe('invalid-format');
    if (result.kind !== 'invalid-format') return;
    expect(result.rawValue).toBe(INVALID_QR);
  });
});

// ─── scanPairingQr — native, scanner throws ───────────────────────────────────

describe('scanPairingQr — native, scanner throws', () => {
  beforeEach(() => {
    mocks.isNative.mockReturnValue(true);
    mocks.requestPermissions.mockRejectedValue(new Error('Camera unavailable'));
  });

  it('returns { kind: "error" } with message', async () => {
    const result = await scanPairingQr();
    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.message).toBe('Camera unavailable');
  });
});

// ─── ensureCameraPermission ───────────────────────────────────────────────────

describe('ensureCameraPermission', () => {
  it('returns "denied" on web (not native)', async () => {
    mocks.isNative.mockReturnValue(false);
    const result = await ensureCameraPermission();
    expect(result).toBe('denied');
  });

  it('returns "granted" when camera state is granted', async () => {
    mocks.isNative.mockReturnValue(true);
    mocks.requestPermissions.mockResolvedValue({ camera: 'granted' });
    const result = await ensureCameraPermission();
    expect(result).toBe('granted');
  });

  it('returns "granted" when camera state is limited (iOS)', async () => {
    mocks.isNative.mockReturnValue(true);
    mocks.requestPermissions.mockResolvedValue({ camera: 'limited' });
    const result = await ensureCameraPermission();
    expect(result).toBe('granted');
  });

  it('returns "denied" when camera state is denied', async () => {
    mocks.isNative.mockReturnValue(true);
    mocks.requestPermissions.mockResolvedValue({ camera: 'denied' });
    const result = await ensureCameraPermission();
    expect(result).toBe('denied');
  });

  it('returns "restricted" when camera state is prompt/unknown', async () => {
    mocks.isNative.mockReturnValue(true);
    mocks.requestPermissions.mockResolvedValue({ camera: 'prompt' });
    const result = await ensureCameraPermission();
    expect(result).toBe('restricted');
  });

  it('returns "denied" when requestPermissions throws', async () => {
    mocks.isNative.mockReturnValue(true);
    mocks.requestPermissions.mockRejectedValue(new Error('Plugin not available'));
    const result = await ensureCameraPermission();
    expect(result).toBe('denied');
  });
});
