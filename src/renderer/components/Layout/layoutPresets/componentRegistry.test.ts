/**
 * componentRegistry.test.ts — Unit tests for the Wave 20 component registry.
 */

import { afterEach, describe, expect, it } from 'vitest';

import {
  getComponent,
  hasComponent,
  initDefaultRegistry,
  registerComponent,
  registeredKeys,
} from './componentRegistry';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Clean up any extra keys added during a test. */
const KNOWN_DEFAULTS = [
  'SessionSidebar',
  'AgentChatWorkspace',
  'TerminalManager',
  'FileViewerManager',
  'AgentCards',
  'AgentSidebarContent',
  'SidebarSections',
  'CentrePaneConnected',
  'ProjectPicker',
  'EditorTabBar',
];

afterEach(() => {
  // Re-run default registration so each test starts with a clean baseline.
  initDefaultRegistry();
});

// ─── Default registry ─────────────────────────────────────────────────────────

describe('initDefaultRegistry', () => {
  it('registers all 10 default component keys', () => {
    const keys = registeredKeys();
    for (const key of KNOWN_DEFAULTS) {
      expect(keys).toContain(key);
    }
  });

  it('all default factories return null (placeholder)', () => {
    for (const key of KNOWN_DEFAULTS) {
      expect(getComponent(key)).toBeNull();
    }
  });
});

// ─── registerComponent / hasComponent / getComponent ─────────────────────────

describe('registerComponent', () => {
  it('registers a new key and makes hasComponent return true', () => {
    registerComponent('TestWidget', () => 'hello');
    expect(hasComponent('TestWidget')).toBe(true);
  });

  it('getComponent calls the factory and returns its value', () => {
    const sentinel = 'sentinel-string-sentinel';
    registerComponent('SentinelWidget', () => sentinel);
    expect(getComponent('SentinelWidget')).toBe(sentinel);
  });

  it('overwriting an existing key replaces the factory', () => {
    registerComponent('SessionSidebar', () => 'overridden');
    expect(getComponent('SessionSidebar')).toBe('overridden');
  });

  it('getComponent returns null for an unknown key', () => {
    expect(getComponent('NonExistentKey')).toBeNull();
  });

  it('hasComponent returns false for an unknown key', () => {
    expect(hasComponent('NonExistentKey')).toBe(false);
  });
});

// ─── registeredKeys ───────────────────────────────────────────────────────────

describe('registeredKeys', () => {
  it('returns a plain array (not the internal map reference)', () => {
    const keys1 = registeredKeys();
    const keys2 = registeredKeys();
    expect(keys1).not.toBe(keys2);
  });

  it('reflects newly registered keys', () => {
    registerComponent('FreshKey', () => null);
    expect(registeredKeys()).toContain('FreshKey');
  });
});
