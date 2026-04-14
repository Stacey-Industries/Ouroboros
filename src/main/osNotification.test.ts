/**
 * osNotification.test.ts — unit tests for the Electron Notification wrapper.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock Electron before importing the module under test ──────────────────────

const mockShow = vi.fn();
const mockOn = vi.fn();

// isSupported is a static property on the constructor — hold it in a ref so
// individual tests can toggle it without re-mocking the whole module.
let notificationSupported = true;

function MockNotification(this: unknown) {
  (this as Record<string, unknown>).on = mockOn;
  (this as Record<string, unknown>).show = mockShow;
}
MockNotification.isSupported = () => notificationSupported;

vi.mock('electron', () => ({
  Notification: MockNotification,
}));

vi.mock('./logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('osNotification.notify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notificationSupported = true;
  });

  it('creates a Notification with the given title and body and shows it', async () => {
    vi.resetModules();
    const { notify } = await import('./osNotification');
    notify({ title: 'Test title', body: 'Test body' });
    expect(mockShow).toHaveBeenCalledOnce();
  });

  it('registers onClick handler when provided', async () => {
    vi.resetModules();
    const { notify } = await import('./osNotification');
    const onClick = vi.fn();
    notify({ title: 'T', body: 'B', onClick });
    expect(mockOn).toHaveBeenCalledWith('click', onClick);
  });

  it('does not register click handler when onClick is omitted', async () => {
    vi.resetModules();
    const { notify } = await import('./osNotification');
    notify({ title: 'T', body: 'B' });
    expect(mockOn).not.toHaveBeenCalled();
  });

  it('no-ops when Notification.isSupported() returns false', async () => {
    notificationSupported = false;
    vi.resetModules();
    const { notify } = await import('./osNotification');
    notify({ title: 'T', body: 'B' });
    expect(mockShow).not.toHaveBeenCalled();
  });
});
