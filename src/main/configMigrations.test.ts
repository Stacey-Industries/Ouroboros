/**
 * configMigrations.test.ts — unit tests for one-shot config migrations.
 *
 * Uses vitest's module mocking to intercept ensureStore so the tests run
 * in Node (no Electron, no real electron-store on disk).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock ensureStore before importing the module under test
// ---------------------------------------------------------------------------

const mockGet = vi.fn();
const mockSet = vi.fn();

vi.mock('./configStoreLazy', () => ({
  ensureStore: () => ({ get: mockGet, set: mockSet }),
}));

import { migrateChatPrimary } from './configMigrations';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('migrateChatPrimary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('no-ops when layout is absent', () => {
    mockGet.mockReturnValue(undefined);
    migrateChatPrimary();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('no-ops when layout.chatPrimary is false', () => {
    mockGet.mockReturnValue({ presets: { v2: true }, chatPrimary: false, immersiveChat: false });
    migrateChatPrimary();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('no-ops when layout.chatPrimary is absent (already migrated)', () => {
    mockGet.mockReturnValue({ presets: { v2: true }, immersiveChat: true });
    migrateChatPrimary();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('sets immersiveChat=true and removes chatPrimary when chatPrimary===true', () => {
    mockGet.mockReturnValue({ presets: { v2: true }, chatPrimary: true, immersiveChat: false });
    migrateChatPrimary();
    expect(mockSet).toHaveBeenCalledOnce();
    const [key, value] = mockSet.mock.calls[0] as [string, Record<string, unknown>];
    expect(key).toBe('layout');
    expect(value).not.toHaveProperty('chatPrimary');
    expect(value.immersiveChat).toBe(true);
    expect(value.presets).toEqual({ v2: true });
  });

  it('preserves all other layout keys during migration', () => {
    mockGet.mockReturnValue({
      presets: { v2: true },
      chatPrimary: true,
      dragAndDrop: true,
      mobilePrimary: false,
    });
    migrateChatPrimary();
    const [, value] = mockSet.mock.calls[0] as [string, Record<string, unknown>];
    expect(value.dragAndDrop).toBe(true);
    expect(value.mobilePrimary).toBe(false);
  });

  it('is idempotent — calling twice with already-migrated config is a no-op on second call', () => {
    // First call: chatPrimary present → migrate
    mockGet.mockReturnValueOnce({ chatPrimary: true });
    migrateChatPrimary();
    expect(mockSet).toHaveBeenCalledOnce();

    // Second call: simulate post-migration state (chatPrimary gone)
    mockGet.mockReturnValueOnce({ immersiveChat: true });
    migrateChatPrimary();
    expect(mockSet).toHaveBeenCalledOnce(); // still only once total
  });
});
