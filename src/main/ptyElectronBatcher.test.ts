import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock electron before importing the module under test
vi.mock('electron', () => ({
  BrowserWindow: class {},
}));

function makeMockWin(destroyed = false) {
  return {
    isDestroyed: vi.fn(() => destroyed),
    webContents: {
      mainFrame: {
        send: vi.fn(),
      },
    },
  };
}

describe('PtyElectronBatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  async function getBatcher() {
    const mod = await import('./ptyElectronBatcher');
    return mod.electronBatcher;
  }

  it('does not send before the 16ms flush window elapses', async () => {
    const batcher = await getBatcher();
    const win = makeMockWin();
    batcher.register('s1', win as never);
    batcher.append('s1', 'hello');
    expect(win.webContents.mainFrame.send).not.toHaveBeenCalled();
    batcher.cleanup('s1');
  });

  it('batches multiple chunks and sends them joined on flush', async () => {
    const batcher = await getBatcher();
    const win = makeMockWin();
    batcher.register('s2', win as never);
    batcher.append('s2', 'foo');
    batcher.append('s2', 'bar');
    batcher.append('s2', 'baz');
    vi.advanceTimersByTime(16);
    expect(win.webContents.mainFrame.send).toHaveBeenCalledOnce();
    expect(win.webContents.mainFrame.send).toHaveBeenCalledWith('pty:data:s2', 'foobarbaz');
    batcher.cleanup('s2');
  });

  it('sends at most one IPC message per 16ms window', async () => {
    const batcher = await getBatcher();
    const win = makeMockWin();
    batcher.register('s3', win as never);
    for (let i = 0; i < 50; i++) batcher.append('s3', 'x');
    vi.advanceTimersByTime(16);
    expect(win.webContents.mainFrame.send).toHaveBeenCalledOnce();
    batcher.cleanup('s3');
  });

  it('does not send when window is destroyed', async () => {
    const batcher = await getBatcher();
    const win = makeMockWin(true);
    batcher.register('s4', win as never);
    batcher.append('s4', 'data');
    vi.advanceTimersByTime(16);
    expect(win.webContents.mainFrame.send).not.toHaveBeenCalled();
    batcher.cleanup('s4');
  });

  it('cleanup flushes remaining data synchronously before removing session', async () => {
    const batcher = await getBatcher();
    const win = makeMockWin();
    batcher.register('s5', win as never);
    batcher.append('s5', 'remaining');
    batcher.cleanup('s5');
    expect(win.webContents.mainFrame.send).toHaveBeenCalledWith('pty:data:s5', 'remaining');
  });

  it('ignores append for unregistered session', async () => {
    const batcher = await getBatcher();
    expect(() => batcher.append('unknown', 'data')).not.toThrow();
  });

  it('dispose flushes all active sessions', async () => {
    const batcher = await getBatcher();
    const winA = makeMockWin();
    const winB = makeMockWin();
    batcher.register('da', winA as never);
    batcher.register('db', winB as never);
    batcher.append('da', 'A');
    batcher.append('db', 'B');
    batcher.dispose();
    expect(winA.webContents.mainFrame.send).toHaveBeenCalledWith('pty:data:da', 'A');
    expect(winB.webContents.mainFrame.send).toHaveBeenCalledWith('pty:data:db', 'B');
  });
});
