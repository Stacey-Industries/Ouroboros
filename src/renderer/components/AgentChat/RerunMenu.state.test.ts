/**
 * RerunMenu.state.test.ts — Wave 59 Phase G
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';

import { buildOverridesPayload, hasElectronAPI } from './RerunMenu.state';

describe('hasElectronAPI', () => {
  it('returns false when electronAPI is absent', () => {
    const orig = (window as Record<string, unknown>).electronAPI;
    delete (window as Record<string, unknown>).electronAPI;
    expect(hasElectronAPI()).toBe(false);
    (window as Record<string, unknown>).electronAPI = orig;
  });

  it('returns true when electronAPI is present', () => {
    Object.defineProperty(window, 'electronAPI', { value: {}, configurable: true, writable: true });
    expect(hasElectronAPI()).toBe(true);
  });
});

describe('buildOverridesPayload', () => {
  it('returns undefined when all values are defaults', () => {
    expect(buildOverridesPayload('', 'medium', 'default')).toBeUndefined();
  });

  it('includes model when set', () => {
    expect(buildOverridesPayload('opus', 'medium', 'default')).toEqual({ model: 'opus' });
  });

  it('includes effort only when non-medium', () => {
    expect(buildOverridesPayload('', 'high', 'default')).toEqual({ effort: 'high' });
    expect(buildOverridesPayload('', 'medium', 'default')).toBeUndefined();
  });

  it('includes permissionMode only when non-default', () => {
    expect(buildOverridesPayload('', 'medium', 'auto')).toEqual({ permissionMode: 'auto' });
    expect(buildOverridesPayload('', 'medium', 'default')).toBeUndefined();
  });

  it('includes all non-default fields together', () => {
    expect(buildOverridesPayload('sonnet', 'high', 'auto')).toEqual({
      model: 'sonnet',
      effort: 'high',
      permissionMode: 'auto',
    });
  });
});
