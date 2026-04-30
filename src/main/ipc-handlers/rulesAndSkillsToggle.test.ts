/**
 * rulesAndSkillsToggle.test.ts — Smoke tests for Wave 62 toggle IPC handlers.
 *
 * Verifies the handler functions register channels, dispatch to the right
 * underlying API, and call broadcastChanged on success. Underlying file-move
 * behavior is covered in rulesDirectoryManager.test.ts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}));

vi.mock('../rulesAndSkills/rulesDirectoryManager', () => ({
  disableRule: vi.fn(),
  enableRule: vi.fn(),
  restoreAllDisabled: vi.fn(),
}));

import { ipcMain } from 'electron';

import * as rulesDirMgr from '../rulesAndSkills/rulesDirectoryManager';
import { registerRulesToggleHandlers } from './rulesAndSkillsToggle';

const handles = ipcMain.handle as unknown as ReturnType<typeof vi.fn>;

function getHandler(channel: string): (e: unknown, args: unknown) => Promise<unknown> {
  const call = handles.mock.calls.find((c: unknown[]) => c[0] === channel);
  if (!call) throw new Error(`Channel not registered: ${channel}`);
  return call[1] as (e: unknown, args: unknown) => Promise<unknown>;
}

describe('registerRulesToggleHandlers', () => {
  let channels: string[];
  let broadcastChanged: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    channels = [];
    broadcastChanged = vi.fn();
    handles.mockClear();
    vi.mocked(rulesDirMgr.disableRule).mockReset();
    vi.mocked(rulesDirMgr.enableRule).mockReset();
    vi.mocked(rulesDirMgr.restoreAllDisabled).mockReset();
    registerRulesToggleHandlers(channels, broadcastChanged as unknown as () => void);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('registers both channels', () => {
    expect(channels).toEqual(['rulesDir:toggle', 'rulesDir:restoreAll']);
  });

  it('rulesDir:toggle calls disableRule when disable=true', async () => {
    vi.mocked(rulesDirMgr.disableRule).mockResolvedValueOnce(undefined);
    const handler = getHandler('rulesDir:toggle');
    const result = await handler(
      {},
      {
        scope: 'global',
        name: 'foo',
        disable: true,
      },
    );
    expect(rulesDirMgr.disableRule).toHaveBeenCalledWith('global', 'foo', undefined);
    expect(broadcastChanged).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: true });
  });

  it('rulesDir:toggle calls enableRule when disable=false', async () => {
    vi.mocked(rulesDirMgr.enableRule).mockResolvedValueOnce(undefined);
    const handler = getHandler('rulesDir:toggle');
    await handler({}, { scope: 'project', name: 'bar', disable: false, projectRoot: '/p' });
    expect(rulesDirMgr.enableRule).toHaveBeenCalledWith('project', 'bar', '/p');
    expect(broadcastChanged).toHaveBeenCalledTimes(1);
  });

  it('rulesDir:toggle returns error envelope and does not broadcast on failure', async () => {
    vi.mocked(rulesDirMgr.disableRule).mockRejectedValueOnce(new Error('boom'));
    const handler = getHandler('rulesDir:toggle');
    const result = await handler({}, { scope: 'global', name: 'foo', disable: true });
    expect(result).toEqual({ success: false, error: 'boom' });
    expect(broadcastChanged).not.toHaveBeenCalled();
  });

  it('rulesDir:restoreAll passes counts through and broadcasts', async () => {
    vi.mocked(rulesDirMgr.restoreAllDisabled).mockResolvedValueOnce({ restored: 2, skipped: 1 });
    const handler = getHandler('rulesDir:restoreAll');
    const result = await handler({}, { scope: 'global' });
    expect(result).toEqual({ success: true, restored: 2, skipped: 1 });
    expect(broadcastChanged).toHaveBeenCalledTimes(1);
  });

  it('rulesDir:restoreAll returns error envelope on failure', async () => {
    vi.mocked(rulesDirMgr.restoreAllDisabled).mockRejectedValueOnce(new Error('nope'));
    const handler = getHandler('rulesDir:restoreAll');
    const result = await handler({}, { scope: 'global' });
    expect(result).toEqual({ success: false, error: 'nope' });
    expect(broadcastChanged).not.toHaveBeenCalled();
  });
});
