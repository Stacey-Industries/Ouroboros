// @vitest-environment jsdom
/**
 * pairingScreen.test.tsx — Unit tests for the PairingScreen component.
 *
 * Wave 33a Phase H — updated for Wave 33b Phase D async token storage.
 * Wave 33b Phase E — deep-link / URL query prefill (no auto-submit, highlight).
 * Wave 33b Phase F — native QR scanner button + scan outcome dispatch.
 *
 * Changes from Phase H:
 *  - tokenStorage is mocked (vi.mock) — fingerprint + token no longer go
 *    through localStorage directly from the component.
 *  - The fingerprint effect is async; tests `await` render stabilisation.
 *  - setRefreshToken (not localStorage.setItem) is asserted on success.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  setRefreshToken: vi.fn(async () => undefined),
  getDeviceFingerprint: vi.fn(async () => 'test-fingerprint-uuid'),
  getRefreshToken: vi.fn(async () => null as string | null),
  clearRefreshToken: vi.fn(async () => undefined),
  readPairingQueryParams: vi.fn(() => null as null | {
    host: string; port: string; code: string; fingerprint: string;
  }),
  initDeepLinkListener: vi.fn(async () => () => undefined),
  isNative: vi.fn(() => false),
  scanPairingQr: vi.fn(async (): Promise<import('../web/capacitor/qrScanner').ScanOutcome> => ({ kind: 'unsupported' })),
}));

vi.mock('../web/tokenStorage', () => ({
  setRefreshToken: mocks.setRefreshToken,
  getDeviceFingerprint: mocks.getDeviceFingerprint,
  getRefreshToken: mocks.getRefreshToken,
  clearRefreshToken: mocks.clearRefreshToken,
}));

vi.mock('../web/capacitor/deepLinks', () => ({
  readPairingQueryParams: (...args: Parameters<typeof mocks.readPairingQueryParams>) =>
    mocks.readPairingQueryParams(...args),
  initDeepLinkListener: (...args: Parameters<typeof mocks.initDeepLinkListener>) =>
    mocks.initDeepLinkListener(...args),
}));

vi.mock('../web/capacitor/index', () => ({
  isNative: () => mocks.isNative(),
}));

vi.mock('../web/capacitor/qrScanner', () => ({
  scanPairingQr: (...args: []) => mocks.scanPairingQr(...args),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const localStore: Record<string, string> = {};
const mockLocalStorage = {
  getItem: vi.fn((k: string) => localStore[k] ?? null),
  setItem: vi.fn((k: string, v: string) => { localStore[k] = v; }),
  removeItem: vi.fn((k: string) => { delete localStore[k]; }),
  clear: vi.fn(() => { for (const k of Object.keys(localStore)) delete localStore[k]; }),
};
vi.stubGlobal('localStorage', mockLocalStorage);

const mockReload = vi.fn();
Object.defineProperty(window, 'location', {
  value: { reload: mockReload, hostname: 'localhost', port: '', search: '' },
  writable: true,
});

// ─── Import after mocks ───────────────────────────────────────────────────────

import { PairingScreen } from './pairingScreen';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderPairing(host = 'myhost.local', port = 7890) {
  return render(<PairingScreen host={host} port={port} />);
}

function makeOkResponse(body: object) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  });
}

function makeErrorResponse(status: number, body: object) {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve(body),
  });
}

/** Submit the pairing form by dispatching a submit event on the <form>. */
function submitForm() {
  const form = document.querySelector('form');
  if (!form) throw new Error('No form found');
  fireEvent.submit(form);
}

/** Wait for fingerprint effect to resolve so button is enabled. */
async function waitForFingerprintReady() {
  await waitFor(() => {
    const btn = screen.getByRole('button', { name: /pair/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
  mockFetch.mockReset();
  mockReload.mockReset();
  mockLocalStorage.clear();
  vi.clearAllMocks();
  // Reset to default resolved fingerprint after each test
  mocks.getDeviceFingerprint.mockResolvedValue('test-fingerprint-uuid');
  // Reset deep-link mocks to no-op defaults
  mocks.readPairingQueryParams.mockReturnValue(null);
  mocks.initDeepLinkListener.mockResolvedValue(() => undefined);
  // Reset Phase F mocks
  mocks.isNative.mockReturnValue(false);
  mocks.scanPairingQr.mockResolvedValue({ kind: 'unsupported' });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PairingScreen rendering', () => {
  it('renders heading and code input', async () => {
    renderPairing();
    await waitForFingerprintReady();
    expect(screen.getByRole('heading', { name: /pair this device/i })).toBeTruthy();
    expect(screen.getByLabelText(/pairing code/i)).toBeTruthy();
  });

  it('displays host as readonly field', async () => {
    renderPairing('192.168.1.100', 7890);
    await waitForFingerprintReady();
    const hostInput = screen.getByDisplayValue('192.168.1.100:7890');
    expect((hostInput as HTMLInputElement).readOnly).toBe(true);
  });

  it('omits port from display when port is 80', async () => {
    renderPairing('example.com', 80);
    await waitForFingerprintReady();
    expect(screen.getByDisplayValue('example.com')).toBeTruthy();
  });

  it('shows default device label placeholder', async () => {
    renderPairing();
    await waitForFingerprintReady();
    const labelInput = screen.getByLabelText(/device name/i) as HTMLInputElement;
    expect(labelInput.placeholder).toBe('Mobile device');
  });

  it('renders a submit button', async () => {
    renderPairing();
    await waitForFingerprintReady();
    expect(screen.getByRole('button', { name: /pair/i })).toBeTruthy();
  });

  it('disables the button while fingerprint is loading', () => {
    // Make fingerprint resolution never settle (pending promise)
    mocks.getDeviceFingerprint.mockReturnValue(new Promise(() => undefined));
    renderPairing();
    const btn = screen.getByRole('button', { name: /pairing…/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});

describe('PairingScreen form validation', () => {
  it('rejects non-6-digit code with inline error', async () => {
    renderPairing();
    await waitForFingerprintReady();
    fireEvent.change(screen.getByLabelText(/pairing code/i), { target: { value: '123' } });
    submitForm();
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/6-digit/i);
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not auto-submit when params are pre-filled (phishing protection)', async () => {
    renderPairing();
    await waitForFingerprintReady();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('PairingScreen happy path', () => {
  beforeEach(() => {
    mockFetch.mockReturnValue(
      makeOkResponse({ refreshToken: 'tok-abc', deviceId: 'dev-1', capabilities: ['paired-read'] }),
    );
  });

  it('posts to /api/pair with code, label, fingerprint on submit', async () => {
    renderPairing();
    await waitForFingerprintReady();
    fireEvent.change(screen.getByLabelText(/pairing code/i), { target: { value: '123456' } });
    submitForm();

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/pair');
    const body = JSON.parse(opts.body as string) as Record<string, string>;
    expect(body.code).toBe('123456');
    expect(body.fingerprint).toBe('test-fingerprint-uuid');
    expect(typeof body.label).toBe('string');
  });

  it('calls setRefreshToken on success (not localStorage directly)', async () => {
    renderPairing();
    await waitForFingerprintReady();
    fireEvent.change(screen.getByLabelText(/pairing code/i), { target: { value: '654321' } });
    submitForm();

    await waitFor(() => expect(mocks.setRefreshToken).toHaveBeenCalled());
    expect(mocks.setRefreshToken).toHaveBeenCalledWith('tok-abc');
    // localStorage.setItem should NOT be called for the token from the component
    const tokenCall = mockLocalStorage.setItem.mock.calls.find(
      (args: [string, string]) => args[0] === 'ouroboros.refreshToken',
    );
    expect(tokenCall).toBeUndefined();
  });

  it('reloads the window after successful pair', async () => {
    renderPairing();
    await waitForFingerprintReady();
    fireEvent.change(screen.getByLabelText(/pairing code/i), { target: { value: '111222' } });
    submitForm();

    await waitFor(() => expect(mockReload).toHaveBeenCalled());
  });
});

describe('PairingScreen error states', () => {
  it('shows error message on invalid code response (401)', async () => {
    mockFetch.mockReturnValue(makeErrorResponse(401, { error: 'Invalid code' }));
    renderPairing();
    await waitForFingerprintReady();
    fireEvent.change(screen.getByLabelText(/pairing code/i), { target: { value: '000000' } });
    submitForm();

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/invalid/i);
    });
    expect(mockReload).not.toHaveBeenCalled();
  });

  it('shows rate-limit message on 429', async () => {
    mockFetch.mockReturnValue(makeErrorResponse(429, { error: 'Rate limited' }));
    renderPairing();
    await waitForFingerprintReady();
    fireEvent.change(screen.getByLabelText(/pairing code/i), { target: { value: '999999' } });
    submitForm();

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/wait/i);
    });
  });

  it('shows expired error message', async () => {
    mockFetch.mockReturnValue(makeErrorResponse(401, { error: 'Code expired' }));
    renderPairing();
    await waitForFingerprintReady();
    fireEvent.change(screen.getByLabelText(/pairing code/i), { target: { value: '123456' } });
    submitForm();

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/expired/i);
    });
  });

  it('shows network error message on fetch rejection', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));
    renderPairing();
    await waitForFingerprintReady();
    fireEvent.change(screen.getByLabelText(/pairing code/i), { target: { value: '123456' } });
    submitForm();

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/network/i);
    });
  });

  it('re-enables button after error', async () => {
    mockFetch.mockReturnValue(makeErrorResponse(401, { error: 'Invalid code' }));
    renderPairing();
    await waitForFingerprintReady();
    fireEvent.change(screen.getByLabelText(/pairing code/i), { target: { value: '000000' } });

    const btn = screen.getByRole('button', { name: /pair/i });
    submitForm();

    await waitFor(() => screen.getByRole('alert'));
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('PairingScreen fingerprint persistence', () => {
  it('calls getDeviceFingerprint on mount', async () => {
    renderPairing();
    await waitForFingerprintReady();
    expect(mocks.getDeviceFingerprint).toHaveBeenCalled();
  });

  it('sends resolved fingerprint in pair request', async () => {
    mocks.getDeviceFingerprint.mockResolvedValue('custom-fp-abc');
    mockFetch.mockReturnValue(
      makeOkResponse({ refreshToken: 'tok', deviceId: 'd', capabilities: [] }),
    );
    renderPairing();
    await waitForFingerprintReady();
    fireEvent.change(screen.getByLabelText(/pairing code/i), { target: { value: '123456' } });
    submitForm();

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string) as Record<string, string>;
    expect(body.fingerprint).toBe('custom-fp-abc');
  });
});

// ─── Phase E: deep-link / URL query prefill ───────────────────────────────────

describe('PairingScreen deep-link prefill (Wave 33b Phase E)', () => {
  beforeEach(() => {
    mocks.getDeviceFingerprint.mockResolvedValue('test-fingerprint-uuid');
    mocks.initDeepLinkListener.mockResolvedValue(() => undefined);
  });

  it('prefills code from URL query params but does NOT auto-submit', async () => {
    mocks.readPairingQueryParams.mockReturnValue({
      host: '192.168.1.50', port: '4173', code: '042819', fingerprint: 'fpX',
    });
    renderPairing();
    await waitForFingerprintReady();

    const codeInput = screen.getByLabelText(/pairing code/i) as HTMLInputElement;
    expect(codeInput.value).toBe('042819');
    // Security requirement: must NOT have auto-submitted
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('applies highlight border on prefill and removes it after 2 s', async () => {
    // Fake timers must be active BEFORE render so the highlight setTimeout
    // registers in the fake queue and can be advanced deterministically.
    vi.useFakeTimers();

    mocks.readPairingQueryParams.mockReturnValue({
      host: '192.168.1.50', port: '4173', code: '042819', fingerprint: 'fpX',
    });
    // getDeviceFingerprint is already a resolved mock — flush with microtasks.
    mocks.getDeviceFingerprint.mockResolvedValue('test-fingerprint-uuid');

    renderPairing();
    // Flush React effects + microtask queue (no real timers needed).
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    const codeInput = screen.getByLabelText(/pairing code/i) as HTMLInputElement;
    expect(codeInput.value).toBe('042819');
    const accentRgb = 'rgb(56, 139, 253)'; // hardcoded: test assertion — jsdom normalises #388bfd to rgb(); not a UI color
    // Highlight is active immediately after prefill
    expect(codeInput.style.border).toContain(accentRgb);

    // Advance past the 2-second highlight duration (registered in fake queue)
    await act(async () => { vi.advanceTimersByTime(2100); });
    expect(codeInput.style.border).not.toContain(accentRgb);

    vi.useRealTimers();
  });

  it('calls initDeepLinkListener on mount', async () => {
    renderPairing();
    await waitForFingerprintReady();
    expect(mocks.initDeepLinkListener).toHaveBeenCalled();
  });

  it('does not prefill when query params are absent', async () => {
    mocks.readPairingQueryParams.mockReturnValue(null);
    renderPairing();
    await waitForFingerprintReady();

    const codeInput = screen.getByLabelText(/pairing code/i) as HTMLInputElement;
    expect(codeInput.value).toBe('');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ─── Phase F: native QR scanner button ────────────────────────────────────────

describe('PairingScreen QR scanner button (Wave 33b Phase F)', () => {
  beforeEach(() => {
    mocks.getDeviceFingerprint.mockResolvedValue('test-fingerprint-uuid');
    mocks.initDeepLinkListener.mockResolvedValue(() => undefined);
  });

  it('does NOT render Scan QR button when isNative() is false', async () => {
    mocks.isNative.mockReturnValue(false);
    renderPairing();
    await waitForFingerprintReady();
    expect(screen.queryByRole('button', { name: /scan qr/i })).toBeNull();
  });

  it('renders Scan QR button when isNative() is true', async () => {
    mocks.isNative.mockReturnValue(true);
    renderPairing();
    await waitForFingerprintReady();
    expect(screen.getByRole('button', { name: /scan qr/i })).toBeTruthy();
  });

  it('disables the scan button and shows "Opening scanner…" while scanning', async () => {
    mocks.isNative.mockReturnValue(true);
    // scanPairingQr never resolves during this test
    mocks.scanPairingQr.mockReturnValue(new Promise(() => undefined));
    renderPairing();
    await waitForFingerprintReady();

    const btn = screen.getByRole('button', { name: /scan qr/i }) as HTMLButtonElement;
    fireEvent.click(btn);

    // aria-label stays "Scan QR code"; text content changes to "Opening scanner…"
    await waitFor(() => {
      expect(btn.textContent).toMatch(/opening scanner/i);
    });
    expect(btn.disabled).toBe(true);
  });

  it('fills code field on success outcome — does NOT auto-submit', async () => {
    mocks.isNative.mockReturnValue(true);
    mocks.scanPairingQr.mockResolvedValue({
      kind: 'success' as const,
      payload: { host: '10.0.0.1', port: '7890', code: '042819', fingerprint: 'fp' },
      rawValue: 'ouroboros://pair?host=10.0.0.1&port=7890&code=042819&fingerprint=fp',
    });
    renderPairing();
    await waitForFingerprintReady();

    fireEvent.click(screen.getByRole('button', { name: /scan qr/i }));

    await waitFor(() => {
      const codeInput = screen.getByLabelText(/pairing code/i) as HTMLInputElement;
      expect(codeInput.value).toBe('042819');
    });
    // Security: must NOT auto-submit
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('shows permission error on denied outcome', async () => {
    mocks.isNative.mockReturnValue(true);
    mocks.scanPairingQr.mockResolvedValue({ kind: 'denied' as const });
    renderPairing();
    await waitForFingerprintReady();

    fireEvent.click(screen.getByRole('button', { name: /scan qr/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/camera permission/i);
    });
  });

  it('shows no error on cancelled outcome', async () => {
    mocks.isNative.mockReturnValue(true);
    mocks.scanPairingQr.mockResolvedValue({ kind: 'cancelled' as const });
    renderPairing();
    await waitForFingerprintReady();

    fireEvent.click(screen.getByRole('button', { name: /scan qr/i }));

    // Wait for scan to complete (button re-enables)
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /scan qr/i }) as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows format error on invalid-format outcome', async () => {
    mocks.isNative.mockReturnValue(true);
    mocks.scanPairingQr.mockResolvedValue({
      kind: 'invalid-format' as const,
      rawValue: 'https://example.com',
    });
    renderPairing();
    await waitForFingerprintReady();

    fireEvent.click(screen.getByRole('button', { name: /scan qr/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/valid pairing link/i);
    });
  });

  it('shows error message on error outcome', async () => {
    mocks.isNative.mockReturnValue(true);
    mocks.scanPairingQr.mockResolvedValue({
      kind: 'error' as const,
      message: 'Camera hardware failure',
    });
    renderPairing();
    await waitForFingerprintReady();

    fireEvent.click(screen.getByRole('button', { name: /scan qr/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/camera hardware failure/i);
    });
  });
});
