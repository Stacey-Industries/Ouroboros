import { EventEmitter } from 'events';
import type { Writable } from 'stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeWritable extends EventEmitter {
  public readonly writes: string[] = [];
  public destroyed = false;

  public write(chunk: string): boolean {
    this.writes.push(chunk);
    return true;
  }

  public end(): void {
    this.destroyed = true;
  }
}

class FakeChildProcess extends EventEmitter {
  public readonly stdout = new EventEmitter();
  public readonly stderr = new EventEmitter();
  public readonly stdin = new FakeWritable() as Writable & FakeWritable;
  public pid = 4242;
  public kill = vi.fn();
}

const { execMock, spawnMock } = vi.hoisted(() => ({
  execMock: vi.fn(),
  spawnMock: vi.fn(),
}));

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    exec: execMock,
    spawn: spawnMock,
  };
});

import {
  buildCodexAppServerArgs,
  ensureCodexAppServerProcess,
  resetCodexAppServerProcessesForTests,
  shutdownCodexAppServerProcesses,
  spawnCodexAppServerProcess,
} from './codexAppServerProcess';

describe('spawnCodexAppServerProcess', () => {
  let child: FakeChildProcess;

  beforeEach(() => {
    child = new FakeChildProcess();
    spawnMock.mockReturnValue(child);
    execMock.mockImplementation((_command, _options, callback: () => void) => callback());
  });

  afterEach(() => {
    resetCodexAppServerProcessesForTests();
    vi.restoreAllMocks();
    spawnMock.mockReset();
    execMock.mockReset();
  });

  it('spawns codex app-server and forwards parsed messages', async () => {
    const handle = spawnCodexAppServerProcess({ cwd: 'C:\\repo' });
    const onMessage = vi.fn();
    handle.onMessage(onMessage);

    child.stdout.emit('data', Buffer.from('{"method":"warning","params":{"message":"hi"}}\n'));
    child.emit('close', 0, null);
    await handle.closed;

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith({
      method: 'warning',
      params: { message: 'hi' },
    });
  });

  it('writes NDJSON to stdin and closes gracefully', () => {
    const handle = spawnCodexAppServerProcess({ cwd: 'C:\\repo' });

    handle.send({
      id: 1,
      method: 'initialize',
      params: { clientInfo: { name: 'ide', version: '1.0.0' }, capabilities: null },
    });
    handle.close();

    expect((child.stdin as FakeWritable).writes[0]).toContain('"method":"initialize"');
    expect((child.stdin as FakeWritable).destroyed).toBe(true);
  });

  it('resolves closed with stderr content', async () => {
    const handle = spawnCodexAppServerProcess({ cwd: 'C:\\repo' });

    child.stderr.emit('data', Buffer.from('boom'));
    child.emit('close', 5, null);

    await expect(handle.closed).resolves.toEqual({ code: 5, signal: null, stderr: 'boom' });
  });

  it('builds powershell args on windows', () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'win32' });
    try {
      expect(buildCodexAppServerArgs({ cwd: 'C:\\repo' })).toEqual({
        command: 'powershell.exe',
        args: ['-NoLogo', '-Command', "& 'codex' 'app-server'"],
      });
    } finally {
      if (originalPlatform) {
        Object.defineProperty(process, 'platform', originalPlatform);
      }
    }
  });

  it('reuses the same process handle for the same session key', async () => {
    const first = await ensureCodexAppServerProcess({ cwd: 'C:\\repo', sessionKey: 'session-1' });
    const second = await ensureCodexAppServerProcess({ cwd: 'C:\\repo', sessionKey: 'session-1' });

    expect(first).toBe(second);
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it('shuts down all registered app-server processes', async () => {
    const first = await ensureCodexAppServerProcess({ cwd: 'C:\\repo', sessionKey: 'session-1' });

    const secondChild = new FakeChildProcess();
    spawnMock.mockReturnValueOnce(secondChild);
    const second = await ensureCodexAppServerProcess({ cwd: 'C:\\repo', sessionKey: 'session-2' });

    const firstClose = first.closed;
    const secondClose = second.closed;
    const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const shutdown = shutdownCodexAppServerProcesses();

    child.emit('close', 0, null);
    secondChild.emit('close', 0, null);
    try {
      await shutdown;
      await Promise.all([firstClose, secondClose]);

      expect((child.stdin as FakeWritable).destroyed).toBe(true);
      expect((secondChild.stdin as FakeWritable).destroyed).toBe(true);
      expect(child.kill).toHaveBeenCalled();
      expect(secondChild.kill).toHaveBeenCalled();
    } finally {
      if (originalPlatform) {
        Object.defineProperty(process, 'platform', originalPlatform);
      }
    }
  });
});
