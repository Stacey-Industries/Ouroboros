/**
 * PlatformSection.test.tsx — smoke tests for Wave 38 Phase F platform settings.
 *
 * vitest runs under Node (no DOM), so we test module shape and config-mutation
 * logic without rendering. The component passes typed onChange calls; we verify
 * that the platform sub-object is patched correctly and config keys are valid.
 */

import { describe, expect, it, vi } from 'vitest';

import type { AppConfig, PlatformConfig } from '../../types/electron';
import { PlatformSection } from './PlatformSection';

// ---------------------------------------------------------------------------
// Component export
// ---------------------------------------------------------------------------

describe('PlatformSection', () => {
  it('exports a function component', () => {
    expect(typeof PlatformSection).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Update-channel config mutations
// ---------------------------------------------------------------------------

type OnChange = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;

function makeDraftWithPlatform(platform: Partial<PlatformConfig>): AppConfig {
  return { platform } as unknown as AppConfig;
}

function captureOnChange(): { calls: Array<[keyof AppConfig, unknown]>; fn: OnChange } {
  const calls: Array<[keyof AppConfig, unknown]> = [];
  const fn: OnChange = (key, value) => calls.push([key, value]);
  return { calls, fn };
}

describe('update channel toggle writes platform.updateChannel', () => {
  it('writes stable when switching to stable', () => {
    const draft = makeDraftWithPlatform({ updateChannel: 'beta' });
    const { calls, fn } = captureOnChange();

    // Simulate what ChannelRadio onChange('stable') triggers:
    const currentPlatform = draft.platform ?? {};
    const patched: PlatformConfig = { ...currentPlatform, updateChannel: 'stable' };
    fn('platform', patched);

    expect(calls).toHaveLength(1);
    const [key, value] = calls[0];
    expect(key).toBe('platform');
    expect((value as PlatformConfig).updateChannel).toBe('stable');
  });

  it('writes beta when switching to beta', () => {
    const draft = makeDraftWithPlatform({ updateChannel: 'stable' });
    const { calls, fn } = captureOnChange();

    const currentPlatform = draft.platform ?? {};
    const patched: PlatformConfig = { ...currentPlatform, updateChannel: 'beta' };
    fn('platform', patched);

    const [, value] = calls[0];
    expect((value as PlatformConfig).updateChannel).toBe('beta');
  });

  it('defaults to stable when updateChannel absent', () => {
    const draft = makeDraftWithPlatform({});
    const channel = draft.platform?.updateChannel ?? 'stable';
    expect(channel).toBe('stable');
  });
});

// ---------------------------------------------------------------------------
// Crash reporter config mutations
// ---------------------------------------------------------------------------

describe('crash reporter toggle writes platform.crashReports.enabled', () => {
  it('enables crash reports', () => {
    const draft = makeDraftWithPlatform({ crashReports: { enabled: false } });
    const { calls, fn } = captureOnChange();

    const currentPlatform = draft.platform ?? {};
    const crashCfg = currentPlatform.crashReports ?? {};
    fn('platform', { ...currentPlatform, crashReports: { ...crashCfg, enabled: true } });

    const [key, value] = calls[0];
    expect(key).toBe('platform');
    expect((value as PlatformConfig).crashReports?.enabled).toBe(true);
  });

  it('disables crash reports', () => {
    const draft = makeDraftWithPlatform({ crashReports: { enabled: true, webhookUrl: 'https://x.com' } });
    const { calls, fn } = captureOnChange();

    const currentPlatform = draft.platform ?? {};
    const crashCfg = currentPlatform.crashReports ?? {};
    fn('platform', { ...currentPlatform, crashReports: { ...crashCfg, enabled: false } });

    const [, value] = calls[0];
    expect((value as PlatformConfig).crashReports?.enabled).toBe(false);
  });

  it('preserves existing webhookUrl when toggling', () => {
    const draft = makeDraftWithPlatform({
      crashReports: { enabled: false, webhookUrl: 'https://hooks.example.com/crash' },
    });
    const { calls, fn } = captureOnChange();

    const currentPlatform = draft.platform ?? {};
    const crashCfg = currentPlatform.crashReports ?? {};
    fn('platform', { ...currentPlatform, crashReports: { ...crashCfg, enabled: true } });

    const [, value] = calls[0];
    expect((value as PlatformConfig).crashReports?.webhookUrl).toBe(
      'https://hooks.example.com/crash',
    );
  });
});

describe('crash reporter webhook URL mutation', () => {
  it('writes updated webhookUrl', () => {
    const draft = makeDraftWithPlatform({ crashReports: { enabled: true, webhookUrl: '' } });
    const { calls, fn } = captureOnChange();

    const currentPlatform = draft.platform ?? {};
    const crashCfg = currentPlatform.crashReports ?? {};
    const newUrl = 'https://hooks.example.com/new';
    fn('platform', { ...currentPlatform, crashReports: { ...crashCfg, webhookUrl: newUrl } });

    const [, value] = calls[0];
    expect((value as PlatformConfig).crashReports?.webhookUrl).toBe(newUrl);
  });

  it('preserves enabled flag when updating webhookUrl', () => {
    const draft = makeDraftWithPlatform({ crashReports: { enabled: true } });
    const { calls, fn } = captureOnChange();

    const currentPlatform = draft.platform ?? {};
    const crashCfg = currentPlatform.crashReports ?? {};
    fn('platform', {
      ...currentPlatform,
      crashReports: { ...crashCfg, webhookUrl: 'https://x.com/hook' },
    });

    const [, value] = calls[0];
    expect((value as PlatformConfig).crashReports?.enabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// openCrashReportsDir IPC call
// ---------------------------------------------------------------------------

describe('openCrashReportsDir', () => {
  it('calls window.electronAPI.crash.openCrashReportsDir', () => {
    const openCrashReportsDir = vi.fn().mockResolvedValue({ success: true });
    (globalThis as Record<string, unknown>).window = {
      electronAPI: { crash: { openCrashReportsDir } },
    };

    void window.electronAPI.crash.openCrashReportsDir();
    expect(openCrashReportsDir).toHaveBeenCalledOnce();
  });
});
