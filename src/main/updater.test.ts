/**
 * updater.test.ts — Unit tests for Wave 38 Phase F updater extensions.
 *
 * Covers:
 *   - isDowngrade() version comparison logic
 *   - configureUpdaterChannel() reads platform.updateChannel from config
 *   - Downgrade guard: update-available listener rejects lower versions
 *
 * Uses _setAutoUpdaterForTest() to inject a fake updater — the module-level
 * require('electron-updater') is not reliably interceptable in fork-pool mode.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./config', () => ({
  getConfigValue: vi.fn(),
}));

vi.mock('./logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('electron', () => ({
  app: { getVersion: () => '2.5.0' },
}));

import { getConfigValue } from './config';
import log from './logger';
import {
  _resetUpdaterStateForTest,
  _setAutoUpdaterForTest,
  configureUpdaterChannel,
  getAutoUpdater,
  getLastOfferedVersion,
  isDowngrade,
  isVersionRejected,
} from './updater';

const mockGetConfigValue = vi.mocked(getConfigValue);

// ---------------------------------------------------------------------------
// Shared fake updater — created fresh per test suite via beforeEach
// ---------------------------------------------------------------------------

type FakeUpdater = {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  requestHeaders: null;
  channel: string;
  on: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
  listeners: Record<string, Array<(...args: unknown[]) => void>>;
  emit(event: string, ...args: unknown[]): void;
};

function makeFakeUpdater(): FakeUpdater {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  return {
    autoDownload: false,
    autoInstallOnAppQuit: true,
    requestHeaders: null,
    channel: 'latest',
    listeners,
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      // eslint-disable-next-line security/detect-object-injection -- event is a known updater event name, not user input
      listeners[event] = listeners[event] ?? [];
      // eslint-disable-next-line security/detect-object-injection -- event is a known updater event name, not user input
      listeners[event].push(listener);
    }),
    removeListener: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      // eslint-disable-next-line security/detect-object-injection -- event is a known updater event name, not user input
      if (listeners[event]) {
        // eslint-disable-next-line security/detect-object-injection -- event is a known updater event name, not user input
        listeners[event] = listeners[event].filter((l) => l !== listener);
      }
    }),
    emit(event: string, ...args: unknown[]) {
      // eslint-disable-next-line security/detect-object-injection -- event is a known updater event name, not user input
      (listeners[event] ?? []).forEach((l) => l(...args));
    },
  };
}

// ---------------------------------------------------------------------------
// isDowngrade()
// ---------------------------------------------------------------------------

describe('isDowngrade', () => {
  it('returns true when candidate has lower patch', () => {
    expect(isDowngrade('2.5.1', '2.5.0')).toBe(true);
  });

  it('returns true when candidate has lower minor', () => {
    expect(isDowngrade('2.5.0', '2.4.9')).toBe(true);
  });

  it('returns true when candidate has lower major', () => {
    expect(isDowngrade('2.0.0', '1.9.9')).toBe(true);
  });

  it('returns false for equal versions', () => {
    expect(isDowngrade('2.5.0', '2.5.0')).toBe(false);
  });

  it('returns false when candidate is higher patch', () => {
    expect(isDowngrade('2.5.0', '2.5.1')).toBe(false);
  });

  it('returns false when candidate is higher minor', () => {
    expect(isDowngrade('2.5.0', '2.6.0')).toBe(false);
  });

  it('returns false when candidate is higher major', () => {
    expect(isDowngrade('2.5.0', '3.0.0')).toBe(false);
  });

  it('returns false for non-semver strings (best-effort)', () => {
    expect(isDowngrade('not-a-version', '2.5.0')).toBe(false);
    expect(isDowngrade('2.5.0', 'not-a-version')).toBe(false);
  });

  it('returns false when candidate is a prerelease of same version', () => {
    // Numeric part of 2.5.0-beta.1 parses to 2.5.0 — not a downgrade
    expect(isDowngrade('2.5.0', '2.5.0-beta.1')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// configureUpdaterChannel()
// ---------------------------------------------------------------------------

describe('configureUpdaterChannel', () => {
  let fake: FakeUpdater;

  beforeEach(() => {
    fake = makeFakeUpdater();
    _setAutoUpdaterForTest(fake as never);
    vi.mocked(log.info).mockClear();
  });

  it('getAutoUpdater returns the injected fake', () => {
    expect(getAutoUpdater()).toBe(fake);
  });

  it('sets channel to stable by default when no config', () => {
    mockGetConfigValue.mockReturnValue(undefined as never);
    configureUpdaterChannel();
    expect(fake.channel).toBe('stable');
  });

  it('sets channel to beta when config says beta', () => {
    mockGetConfigValue.mockReturnValue({ updateChannel: 'beta' } as never);
    configureUpdaterChannel();
    expect(fake.channel).toBe('beta');
  });

  it('sets channel to stable when config explicitly says stable', () => {
    mockGetConfigValue.mockReturnValue({ updateChannel: 'stable' } as never);
    configureUpdaterChannel();
    expect(fake.channel).toBe('stable');
  });

  it('logs the channel name', () => {
    mockGetConfigValue.mockReturnValue({ updateChannel: 'beta' } as never);
    configureUpdaterChannel();
    const calls = vi.mocked(log.info).mock.calls;
    const matched = calls.some((args: unknown[]) => String(args[0]).includes('beta'));
    expect(matched).toBe(true);
  });

  it('registers an update-available listener', () => {
    mockGetConfigValue.mockReturnValue({ updateChannel: 'stable' } as never);
    configureUpdaterChannel();
    expect(fake.on).toHaveBeenCalledWith('update-available', expect.any(Function));
  });
});

// ---------------------------------------------------------------------------
// Downgrade guard — update-available listener
// ---------------------------------------------------------------------------

describe('downgrade guard', () => {
  let fake: FakeUpdater;

  beforeEach(() => {
    fake = makeFakeUpdater();
    _setAutoUpdaterForTest(fake as never);
    _resetUpdaterStateForTest();
    vi.mocked(log.warn).mockClear();
    mockGetConfigValue.mockReturnValue({ updateChannel: 'stable' } as never);
  });

  it('logs a warning when offered version is lower than current (2.4.0 < 2.5.0)', () => {
    configureUpdaterChannel();
    fake.emit('update-available', { version: '2.4.0' });
    expect(vi.mocked(log.warn)).toHaveBeenCalledWith(
      expect.stringContaining('downgrade rejected'),
    );
  });

  it('does not warn for a legitimate upgrade', () => {
    configureUpdaterChannel();
    fake.emit('update-available', { version: '2.6.0' });
    expect(vi.mocked(log.warn)).not.toHaveBeenCalled();
  });

  it('does not warn for the same version', () => {
    configureUpdaterChannel();
    fake.emit('update-available', { version: '2.5.0' });
    expect(vi.mocked(log.warn)).not.toHaveBeenCalled();
  });

  it('marks the downgrade version as rejected in the set', () => {
    configureUpdaterChannel();
    fake.emit('update-available', { version: '2.4.0' });
    expect(isVersionRejected('2.4.0')).toBe(true);
  });

  it('does not mark a legitimate upgrade as rejected', () => {
    configureUpdaterChannel();
    fake.emit('update-available', { version: '2.6.0' });
    expect(isVersionRejected('2.6.0')).toBe(false);
  });

  it('records the last offered version for downgrades', () => {
    configureUpdaterChannel();
    fake.emit('update-available', { version: '2.4.0' });
    expect(getLastOfferedVersion()).toBe('2.4.0');
  });

  it('records the last offered version for upgrades', () => {
    configureUpdaterChannel();
    fake.emit('update-available', { version: '2.6.0' });
    expect(getLastOfferedVersion()).toBe('2.6.0');
  });

  it('_resetUpdaterStateForTest clears rejected versions and last offered', () => {
    configureUpdaterChannel();
    fake.emit('update-available', { version: '2.4.0' });
    _resetUpdaterStateForTest();
    expect(isVersionRejected('2.4.0')).toBe(false);
    expect(getLastOfferedVersion()).toBeNull();
  });
});
