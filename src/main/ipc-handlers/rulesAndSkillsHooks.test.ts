/**
 * rulesAndSkillsHooks.test.ts — Smoke tests for the extracted hooks IPC registrar.
 *
 * The behavior in this file used to live in rulesAndSkills.ts and was
 * exercised end-to-end by the existing rulesAndSkills suite. After the
 * Wave 62 line-count split, this file holds focused tests confirming the
 * registrar binds the right channel names and dispatches to the underlying
 * hooksManager APIs.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}));

vi.mock('../rulesAndSkills/hooksManager', () => ({
  addHook: vi.fn(),
  readHooksConfig: vi.fn(),
  removeHook: vi.fn(),
}));

import { ipcMain } from 'electron';

import * as hooksManager from '../rulesAndSkills/hooksManager';
import { registerHooksHandlers } from './rulesAndSkillsHooks';

const handles = ipcMain.handle as unknown as ReturnType<typeof vi.fn>;

function getHandler(channel: string): (e: unknown, ...args: unknown[]) => Promise<unknown> {
  const call = handles.mock.calls.find((c: unknown[]) => c[0] === channel);
  if (!call) throw new Error(`Channel not registered: ${channel}`);
  return call[1] as (e: unknown, ...args: unknown[]) => Promise<unknown>;
}

describe('registerHooksHandlers', () => {
  let channels: string[];

  beforeEach(() => {
    channels = [];
    handles.mockClear();
    vi.mocked(hooksManager.addHook).mockReset();
    vi.mocked(hooksManager.readHooksConfig).mockReset();
    vi.mocked(hooksManager.removeHook).mockReset();
    registerHooksHandlers(channels);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('registers all three channels', () => {
    expect(channels).toEqual(['hooks:getConfig', 'hooks:addHook', 'hooks:removeHook']);
  });

  it('hooks:getConfig dispatches to readHooksConfig and returns success envelope', async () => {
    const fakeHooks = { PreToolUse: [] };
    vi.mocked(hooksManager.readHooksConfig).mockResolvedValueOnce(fakeHooks as never);

    const handler = getHandler('hooks:getConfig');
    const result = await handler({}, 'global', undefined);

    expect(hooksManager.readHooksConfig).toHaveBeenCalledWith('global', undefined);
    expect(result).toEqual({ success: true, hooks: fakeHooks });
  });

  it('hooks:getConfig wraps thrown errors in failure envelope', async () => {
    vi.mocked(hooksManager.readHooksConfig).mockRejectedValueOnce(new Error('boom'));

    const handler = getHandler('hooks:getConfig');
    const result = await handler({}, 'project', '/tmp/p');

    expect(result).toEqual({ success: false, error: 'boom' });
  });

  it('hooks:addHook dispatches to addHook with full args object', async () => {
    vi.mocked(hooksManager.addHook).mockResolvedValueOnce(undefined);

    const handler = getHandler('hooks:addHook');
    const result = await handler(
      {},
      {
        scope: 'project',
        eventType: 'PreToolUse',
        command: 'node x.mjs',
        matcher: 'Bash',
        projectRoot: '/tmp/p',
      },
    );

    expect(hooksManager.addHook).toHaveBeenCalledWith({
      scope: 'project',
      eventType: 'PreToolUse',
      command: 'node x.mjs',
      matcher: 'Bash',
      projectRoot: '/tmp/p',
    });
    expect(result).toEqual({ success: true });
  });

  it('hooks:addHook wraps non-Error throws as String(error)', async () => {
    vi.mocked(hooksManager.addHook).mockRejectedValueOnce('plain-string-throw');

    const handler = getHandler('hooks:addHook');
    const result = await handler({}, { scope: 'global', eventType: 'PostToolUse', command: 'x' });

    expect(result).toEqual({ success: false, error: 'plain-string-throw' });
  });

  it('hooks:removeHook dispatches to removeHook with index', async () => {
    vi.mocked(hooksManager.removeHook).mockResolvedValueOnce(undefined);

    const handler = getHandler('hooks:removeHook');
    const result = await handler({}, { scope: 'global', eventType: 'PreToolUse', index: 2 });

    expect(hooksManager.removeHook).toHaveBeenCalledWith('global', 'PreToolUse', 2, undefined);
    expect(result).toEqual({ success: true });
  });

  it('hooks:removeHook wraps errors in failure envelope', async () => {
    vi.mocked(hooksManager.removeHook).mockRejectedValueOnce(new Error('out of range'));

    const handler = getHandler('hooks:removeHook');
    const result = await handler(
      {},
      { scope: 'project', eventType: 'PreToolUse', index: 99, projectRoot: '/tmp/p' },
    );

    expect(result).toEqual({ success: false, error: 'out of range' });
  });
});
