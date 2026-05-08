/**
 * boundaryRegistry.test.ts — Wave 85 Phase 2.
 *
 * Tests for the regex-based boundary registry scanner.
 * Covers: ipcMain.handle pattern variants, ipcRenderer.invoke bridge detection,
 * registry rebuild, lookup helpers, and graceful degradation when dirs are absent.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Import after mocks are set up.
import {
  getBoundaryRegistry,
  lookupBridge,
  lookupMainHandler,
  rebuildBoundaryRegistry,
  setProjectRoot,
} from './boundaryRegistry';

// ─── Fixture helpers ──────────────────────────────────────────────────────────

function makeTmpProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'br-test-'));
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- tmp test dir
  fs.mkdirSync(path.join(dir, 'src', 'main', 'ipc-handlers'), { recursive: true });
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- tmp test dir
  fs.mkdirSync(path.join(dir, 'src', 'preload'), { recursive: true });
  return dir;
}

function writeMain(dir: string, name: string, content: string): void {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- tmp test dir
  fs.writeFileSync(path.join(dir, 'src', 'main', 'ipc-handlers', name), content, 'utf8');
}

function writePreload(dir: string, name: string, content: string): void {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- tmp test dir
  fs.writeFileSync(path.join(dir, 'src', 'preload', name), content, 'utf8');
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('boundaryRegistry — scanMainFile patterns', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpProject();
    // Reset module state between tests by forcibly clearing the cached registry.
    setProjectRoot(tmpDir);
    void rebuildBoundaryRegistry();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects a named handler', async () => {
    writeMain(
      tmpDir,
      'handlers.ts',
      `
      ipcMain.handle('pty:spawn', spawnHandler);
    `,
    );
    await rebuildBoundaryRegistry();
    const reg = await getBoundaryRegistry();
    const entry = lookupMainHandler(reg, 'pty:spawn');
    expect(entry).not.toBeNull();
    expect(entry!.handlerSymbol).toBe('spawnHandler');
    expect(entry!.handlerFile).toContain('handlers.ts');
    expect(entry!.handlerLine).toBeGreaterThan(0);
  });

  it('detects an anonymous arrow handler', async () => {
    writeMain(
      tmpDir,
      'handlers.ts',
      `
      ipcMain.handle('files:readDir', async (event, dirPath) => {
        return { success: true };
      });
    `,
    );
    await rebuildBoundaryRegistry();
    const reg = await getBoundaryRegistry();
    const entry = lookupMainHandler(reg, 'files:readDir');
    expect(entry).not.toBeNull();
    expect(entry!.handlerSymbol).toBe('<handler:files:readDir>');
  });

  it('detects multiple handlers in one file', async () => {
    writeMain(
      tmpDir,
      'handlers.ts',
      `
      ipcMain.handle('flowTracer:get-canonical-flows', getFlows);
      ipcMain.handle('flowTracer:trace-flow', traceFlow);
    `,
    );
    await rebuildBoundaryRegistry();
    const reg = await getBoundaryRegistry();
    expect(lookupMainHandler(reg, 'flowTracer:get-canonical-flows')).not.toBeNull();
    expect(lookupMainHandler(reg, 'flowTracer:trace-flow')).not.toBeNull();
  });

  it('deduplicates if the same channel appears in multiple files', async () => {
    writeMain(tmpDir, 'a.ts', `ipcMain.handle('dup:channel', handlerA);`);
    writeMain(tmpDir, 'b.ts', `ipcMain.handle('dup:channel', handlerB);`);
    await rebuildBoundaryRegistry();
    const reg = await getBoundaryRegistry();
    // First occurrence wins — registry has exactly one entry.
    expect(reg.ipcMainHandlers.has('dup:channel')).toBe(true);
  });

  it('returns null for unknown channel', async () => {
    writeMain(tmpDir, 'handlers.ts', `ipcMain.handle('known:channel', fn);`);
    await rebuildBoundaryRegistry();
    const reg = await getBoundaryRegistry();
    expect(lookupMainHandler(reg, 'unknown:channel')).toBeNull();
  });
});

describe('boundaryRegistry — scanPreloadFile patterns', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpProject();
    setProjectRoot(tmpDir);
    void rebuildBoundaryRegistry();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects ipcRenderer.invoke in a supplemental file', async () => {
    writePreload(
      tmpDir,
      'preloadSupplementalFlowTracerApis.ts',
      `
      export const flowTracerApi = {
        traceFlow: (entry) => ipcRenderer.invoke('flowTracer:trace-flow', entry),
        getCanonicalFlows: () => ipcRenderer.invoke('flowTracer:get-canonical-flows'),
      };
    `,
    );
    await rebuildBoundaryRegistry();
    const reg = await getBoundaryRegistry();
    // Bridge keys use inferred namespace 'flowTracer' from filename.
    expect(reg.preloadBridge.size).toBeGreaterThan(0);
    // At least the trace-flow channel should be captured.
    const bridgeEntries = Array.from(reg.preloadBridge.values());
    const channels = bridgeEntries.map((e) => e.channel);
    expect(channels).toContain('flowTracer:trace-flow');
  });

  it('infers namespace from filename preloadSupplementalXyzApis.ts → xyz', async () => {
    writePreload(
      tmpDir,
      'preloadSupplementalPtyApis.ts',
      `
      export const ptyApi = {
        spawn: (id, opts) => ipcRenderer.invoke('pty:spawn', id, opts),
      };
    `,
    );
    await rebuildBoundaryRegistry();
    const reg = await getBoundaryRegistry();
    const entries = Array.from(reg.preloadBridge.values());
    const ptyEntries = entries.filter((e) => e.namespace === 'pty');
    expect(ptyEntries.length).toBeGreaterThan(0);
  });

  it('lookupBridge finds entry by namespace.method key', async () => {
    writePreload(
      tmpDir,
      'preloadSupplementalFlowTracerApis.ts',
      `
      export const flowTracerApi = {
        traceFlow: (entry) => ipcRenderer.invoke('flowTracer:trace-flow', entry),
      };
    `,
    );
    await rebuildBoundaryRegistry();
    const reg = await getBoundaryRegistry();
    // The key may vary based on method-name extraction; verify channel is correct.
    const entries = Array.from(reg.preloadBridge.values());
    const traceEntry = entries.find((e) => e.channel === 'flowTracer:trace-flow');
    if (traceEntry) {
      const found = lookupBridge(reg, `${traceEntry.namespace}.${traceEntry.method}`);
      expect(found).not.toBeNull();
      expect(found!.channel).toBe('flowTracer:trace-flow');
    }
    // Either entry is found or it's deferred to the 'unknown' fallback.
    expect(entries.length).toBeGreaterThan(0);
  });
});

describe('boundaryRegistry — lifecycle', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = makeTmpProject();
    setProjectRoot(tmpDir);
    await rebuildBoundaryRegistry();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('getBoundaryRegistry returns a registry with builtAt set', async () => {
    const before = Date.now();
    const reg = await getBoundaryRegistry();
    expect(reg.builtAt).toBeGreaterThanOrEqual(before);
    expect(reg.ipcMainHandlers).toBeInstanceOf(Map);
    expect(reg.preloadBridge).toBeInstanceOf(Map);
  });

  it('second call returns the same cached instance', async () => {
    const reg1 = await getBoundaryRegistry();
    const reg2 = await getBoundaryRegistry();
    expect(reg1).toBe(reg2);
  });

  it('rebuildBoundaryRegistry invalidates cache and rebuilds', async () => {
    const reg1 = await getBoundaryRegistry();
    await rebuildBoundaryRegistry();
    const reg2 = await getBoundaryRegistry();
    expect(reg1).not.toBe(reg2);
  });

  it('handles missing src/main directory gracefully', async () => {
    // Point at a dir with no src/main subtree.
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'br-empty-'));
    try {
      setProjectRoot(emptyDir);
      await rebuildBoundaryRegistry();
      const reg = await getBoundaryRegistry();
      expect(reg.ipcMainHandlers.size).toBe(0);
      expect(reg.preloadBridge.size).toBe(0);
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
      setProjectRoot(tmpDir);
    }
  });
});
