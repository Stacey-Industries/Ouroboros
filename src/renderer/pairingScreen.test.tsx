// @vitest-environment jsdom
/**
 * pairingScreen.test.tsx — Unit tests for the PairingScreen component.
 *
 * Wave 33a Phase H — updated for Wave 33b Phase D async token storage.
 *
 * Changes from Phase H:
 *  - tokenStorage is mocked (vi.mock) — fingerprint + token no longer go
 *    through localStorage directly from the component.
 *  - The fingerprint effect is async; tests `await` render stabilisation.
 *  - setRefreshToken (not localStorage.setItem) is asserted on success.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  setRefreshToken: vi.fn(async () => undefined),
  getDeviceFingerprint: vi.fn(async () => 'test-fingerprint-uuid'),
  getRefreshToken: vi.fn(async () => null as string | null),
  clearRefreshToken: vi.fn(async () => undefined),
}));

vi.mock('../web/tokenStorage', () => ({
  setRefreshToken: mocks.setRefreshToken,
  getDeviceFingerprint: mocks.getDeviceFingerprint,
  getRefreshToken: mocks.getRefreshToken,
  clearRefreshToken: mocks.clearRefreshToken,
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
  value: { reload: mockReload, hostname: 'localhost', port: '' },
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
