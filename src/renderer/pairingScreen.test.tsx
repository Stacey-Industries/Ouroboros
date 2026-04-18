// @vitest-environment jsdom
/**
 * pairingScreen.test.tsx — Unit tests for the PairingScreen component.
 *
 * Wave 33a Phase H.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PairingScreen } from './pairingScreen';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

vi.stubGlobal('crypto', {
  randomUUID: vi.fn(() => 'test-fingerprint-uuid'),
});

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

// ─── Setup / teardown ─────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
  mockFetch.mockReset();
  mockReload.mockReset();
  mockLocalStorage.clear();
  mockLocalStorage.getItem.mockImplementation((k: string) => localStore[k] ?? null);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PairingScreen rendering', () => {
  it('renders heading and code input', () => {
    renderPairing();
    expect(screen.getByRole('heading', { name: /pair this device/i })).toBeTruthy();
    expect(screen.getByLabelText(/pairing code/i)).toBeTruthy();
  });

  it('displays host as readonly field', () => {
    renderPairing('192.168.1.100', 7890);
    const hostInput = screen.getByDisplayValue('192.168.1.100:7890');
    expect((hostInput as HTMLInputElement).readOnly).toBe(true);
  });

  it('omits port from display when port is 80', () => {
    renderPairing('example.com', 80);
    expect(screen.getByDisplayValue('example.com')).toBeTruthy();
  });

  it('shows default device label placeholder', () => {
    renderPairing();
    const labelInput = screen.getByLabelText(/device name/i) as HTMLInputElement;
    expect(labelInput.placeholder).toBe('Mobile device');
  });

  it('renders a submit button', () => {
    renderPairing();
    expect(screen.getByRole('button', { name: /pair/i })).toBeTruthy();
  });
});

describe('PairingScreen form validation', () => {
  it('rejects non-6-digit code with inline error', async () => {
    renderPairing();
    fireEvent.change(screen.getByLabelText(/pairing code/i), { target: { value: '123' } });
    submitForm();
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/6-digit/i);
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not auto-submit when params are pre-filled (phishing protection)', () => {
    renderPairing();
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

  it('stores refreshToken in localStorage on success', async () => {
    renderPairing();
    fireEvent.change(screen.getByLabelText(/pairing code/i), { target: { value: '654321' } });
    submitForm();

    await waitFor(() => expect(mockLocalStorage.setItem).toHaveBeenCalled());
    const call = mockLocalStorage.setItem.mock.calls.find(
      (args: [string, string]) => args[0] === 'ouroboros.refreshToken',
    );
    expect(call?.[0]).toBe('ouroboros.refreshToken');
    expect(call?.[1]).toBe('tok-abc');
  });

  it('reloads the window after successful pair', async () => {
    renderPairing();
    fireEvent.change(screen.getByLabelText(/pairing code/i), { target: { value: '111222' } });
    submitForm();

    await waitFor(() => expect(mockReload).toHaveBeenCalled());
  });
});

describe('PairingScreen error states', () => {
  it('shows error message on invalid code response (401)', async () => {
    mockFetch.mockReturnValue(makeErrorResponse(401, { error: 'Invalid code' }));
    renderPairing();
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
    fireEvent.change(screen.getByLabelText(/pairing code/i), { target: { value: '999999' } });
    submitForm();

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/wait/i);
    });
  });

  it('shows expired error message', async () => {
    mockFetch.mockReturnValue(makeErrorResponse(401, { error: 'Code expired' }));
    renderPairing();
    fireEvent.change(screen.getByLabelText(/pairing code/i), { target: { value: '123456' } });
    submitForm();

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/expired/i);
    });
  });

  it('shows network error message on fetch rejection', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));
    renderPairing();
    fireEvent.change(screen.getByLabelText(/pairing code/i), { target: { value: '123456' } });
    submitForm();

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/network/i);
    });
  });

  it('re-enables button after error', async () => {
    mockFetch.mockReturnValue(makeErrorResponse(401, { error: 'Invalid code' }));
    renderPairing();
    fireEvent.change(screen.getByLabelText(/pairing code/i), { target: { value: '000000' } });

    const btn = screen.getByRole('button', { name: /pair/i });
    submitForm();

    await waitFor(() => screen.getByRole('alert'));
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('PairingScreen fingerprint persistence', () => {
  it('generates fingerprint and stores it on first submit', async () => {
    mockFetch.mockReturnValue(
      makeOkResponse({ refreshToken: 'tok', deviceId: 'd', capabilities: [] }),
    );
    renderPairing();
    fireEvent.change(screen.getByLabelText(/pairing code/i), { target: { value: '123456' } });
    submitForm();

    await waitFor(() => expect(mockLocalStorage.setItem).toHaveBeenCalled());
    const fpCall = mockLocalStorage.setItem.mock.calls.find(
      (args: [string, string]) => args[0] === 'ouroboros.deviceFingerprint',
    );
    expect(fpCall).toBeTruthy();
  });

  it('reuses existing fingerprint from localStorage', async () => {
    mockLocalStorage.getItem.mockImplementation((k: string) =>
      k === 'ouroboros.deviceFingerprint' ? 'existing-fp' : (null as unknown as string),
    );
    mockFetch.mockReturnValue(
      makeOkResponse({ refreshToken: 'tok', deviceId: 'd', capabilities: [] }),
    );
    renderPairing();
    fireEvent.change(screen.getByLabelText(/pairing code/i), { target: { value: '123456' } });
    submitForm();

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string) as Record<string, string>;
    expect(body.fingerprint).toBe('existing-fp');
  });
});
