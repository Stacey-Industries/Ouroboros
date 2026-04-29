/**
 * crashRecovery.test.ts — Wave 51 Phase E
 *
 * Crash-recovery downgrade coverage for the CodeMode ↔ internalMcp
 * routing path. Phase B's `claudeCodeMode.acquireCodeModeForLaunch`
 * never throws; on failure it returns `{ ownsLifecycle: false }`. The
 * launch path in `claudeCodeLaunch.ts` then sets `codemodeAcquireFailed`
 * on the per-spawn config build, which `scopedMcpConfig` feeds into
 * `downgradeOnCodemodeFailure`. This suite verifies the downgrade
 * actually flips the routing outcome and the resulting settings file.
 *
 * What we explicitly exercise:
 *   - The pure `downgradeOnCodemodeFailure` contract (route → direct,
 *     omit preserved, direct preserved). Pure tests in
 *     `internalMcpRoutingPolicy.test.ts` already cover this; we re-pin
 *     it here so the integration shape doesn't drift.
 *   - The end-to-end downgrade path through `buildScopedMcpConfig`:
 *     when `codemodeAcquireFailed=true`, the written settings file
 *     contains the direct-inject `ouroboros` entry rather than the
 *     proxy-routing omission.
 *   - The "settings cleanup" contract: after the downgrade, the temp
 *     config carries either the direct-inject entry or no entry — never
 *     both at once.
 *   - Mid-spawn lifecycle equivalence: the policy treats every per-spawn
 *     failure independently. A second spawn after a first failure does
 *     not "remember" the first; it consults the policy fresh.
 *
 * What is OUT of scope:
 *   - Real subprocess crashes of `proxyServer.ts` — that path is owned
 *     by Claude Code's MCP client lifecycle, not the IDE. The IDE only
 *     observes the failure via `acquireCodeModeForLaunch`.
 *   - Idempotency of `acquireCodeModeForLaunch` — already covered in
 *     `claudeCodeMode.test.ts`. We do not duplicate it.
 *
 * Mocking, same shape as `codemode.internalMcp.integration.test.ts`:
 * `fs/promises` selectively, `fs` fully (no telemetry pollution),
 * `electron` stubbed.
 */

import { readFileSync } from 'fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mocks ───────────────────────────────────────────────────────────

const { mockGetConfigValue, mockGetInternalMcpUrl, mockReadFile, mockMkdirSync, mockAppendFile } =
  vi.hoisted(() => ({
    mockGetConfigValue: vi.fn(),
    mockGetInternalMcpUrl: vi.fn(),
    mockReadFile: vi.fn(),
    mockMkdirSync: vi.fn(),
    mockAppendFile: vi.fn(),
  }));

vi.mock('../config', () => ({ getConfigValue: mockGetConfigValue }));
vi.mock('../internalMcp/internalMcpPortRegistry', () => ({
  getInternalMcpUrl: mockGetInternalMcpUrl,
}));
vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  const wrappedReadFile = (
    p: Parameters<typeof actual.readFile>[0],
    o?: Parameters<typeof actual.readFile>[1],
  ) => {
    if (typeof p === 'string' && p.endsWith('.claude.json')) {
      return mockReadFile(p, o);
    }
    return actual.readFile(p, o);
  };
  return { ...actual, readFile: wrappedReadFile };
});

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    default: { ...actual, mkdirSync: mockMkdirSync, appendFile: mockAppendFile },
    mkdirSync: mockMkdirSync,
    appendFile: mockAppendFile,
  };
});

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }));

import {
  decideInternalMcpRouting,
  downgradeOnCodemodeFailure,
  type RoutingDecision,
} from '../orchestration/providers/internalMcpRoutingPolicy';
import { buildScopedMcpConfig } from '../orchestration/providers/scopedMcpConfig';

// ─── Constants ───────────────────────────────────────────────────────────────

const OUROBOROS_URL = 'http://127.0.0.1:54321/sse';
const FAKE_MAIN_OUT = '/fake/main/out';

// ─── Test helpers ────────────────────────────────────────────────────────────

interface ConfigShape {
  internalMcpUseStrictConfig?: boolean;
  internalMcpScope?: 'always' | 'task-gated' | 'never';
  internalMcp?: { transport?: 'sse' | 'stdio' };
  codemode?: { enabled?: boolean; routeInternalMcp?: boolean };
}

function applyConfig(shape: ConfigShape): void {
  mockGetConfigValue.mockImplementation((key: string) => {
    if (key === 'internalMcpUseStrictConfig') return shape.internalMcpUseStrictConfig !== false;
    if (key === 'internalMcpScope') return shape.internalMcpScope ?? 'task-gated';
    if (key === 'internalMcp') return shape.internalMcp;
    if (key === 'codemode') return shape.codemode;
    if (key === 'internalMcpEnabled') return true;
    return undefined;
  });
}

function readWrittenConfig(configPath: string): {
  mcpServers: Record<string, { url?: string; command?: string; args?: string[] }>;
} {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path produced by builder
  const raw = readFileSync(configPath, 'utf-8');
  return JSON.parse(raw) as ReturnType<typeof readWrittenConfig>;
}

beforeEach(() => {
  mockGetConfigValue.mockReset();
  mockGetInternalMcpUrl.mockReset();
  mockReadFile.mockReset();
  mockMkdirSync.mockReset();
  mockAppendFile.mockReset();
  mockGetInternalMcpUrl.mockReturnValue(OUROBOROS_URL);
  mockReadFile.mockResolvedValue(JSON.stringify({ mcpServers: {} }));
  mockMkdirSync.mockReturnValue(undefined);
  mockAppendFile.mockImplementation((_p: string, _d: string, cb: (err?: unknown) => void) =>
    cb(null),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Pure downgrade contract ─────────────────────────────────────────────────

describe('downgradeOnCodemodeFailure (re-pinned for integration shape)', () => {
  it('flips route-through-codemode → direct-inject', () => {
    expect(downgradeOnCodemodeFailure('route-through-codemode')).toBe('direct-inject');
  });

  it('preserves direct-inject (no over-correction)', () => {
    expect(downgradeOnCodemodeFailure('direct-inject')).toBe('direct-inject');
  });

  it('preserves omit (intentional gate, never a failure mode)', () => {
    expect(downgradeOnCodemodeFailure('omit')).toBe('omit');
  });
});

// ─── End-to-end downgrade through buildScopedMcpConfig ───────────────────────

describe('buildScopedMcpConfig downgrades when codemodeAcquireFailed=true', () => {
  it('would-have-routed → direct-inject; settings file gets the ouroboros entry', async () => {
    applyConfig({
      internalMcpScope: 'task-gated',
      internalMcp: { transport: 'stdio' },
      codemode: { enabled: true, routeInternalMcp: true },
    });

    // Sanity: without failure, the policy is route-through-codemode.
    const baseline = decideInternalMcpRouting({
      codemodeEnabled: true,
      routeInternalMcp: true,
      internalMcpScope: 'task-gated',
      taskNeedsGraphTools: true,
      transport: 'stdio',
    });
    expect(baseline).toBe('route-through-codemode');

    const result = await buildScopedMcpConfig({
      goalShape: 'code',
      sessionId: 'recovery-session-1',
      codemodeAcquireFailed: true,
      mainOutDir: FAKE_MAIN_OUT,
    });
    expect(result).not.toBeNull();
    expect(result!.routingDecision).toBe('direct-inject');

    const data = readWrittenConfig(result!.configPath);
    const entry = data.mcpServers['ouroboros'];
    // Direct-inject + stdio → command/args; not the route-through-codemode omission.
    expect(entry).toBeDefined();
    expect(entry.command).toBe('node');
    expect(entry.args![0]).toMatch(/internalMcpStdioTransport\.js$/);
    await result!.cleanup();
  });

  it('passes-through direct-inject untouched when failure flag set (no double-downgrade)', async () => {
    applyConfig({
      internalMcpScope: 'task-gated',
      internalMcp: { transport: 'sse' },
      codemode: { enabled: false, routeInternalMcp: false },
    });
    const result = await buildScopedMcpConfig({
      goalShape: 'code',
      sessionId: 'recovery-session-2',
      codemodeAcquireFailed: true,
      mainOutDir: FAKE_MAIN_OUT,
    });
    expect(result).not.toBeNull();
    expect(result!.routingDecision).toBe('direct-inject');
    const entry = readWrittenConfig(result!.configPath).mcpServers['ouroboros'];
    expect(entry.url).toBe(OUROBOROS_URL);
    await result!.cleanup();
  });

  it('preserves omit when failure flag set (scope gate is not crash-recovery territory)', async () => {
    applyConfig({
      internalMcpScope: 'never',
      internalMcp: { transport: 'stdio' },
      codemode: { enabled: true, routeInternalMcp: true },
    });
    const result = await buildScopedMcpConfig({
      goalShape: 'code',
      sessionId: 'recovery-session-3',
      codemodeAcquireFailed: true,
      mainOutDir: FAKE_MAIN_OUT,
    });
    expect(result).not.toBeNull();
    expect(result!.routingDecision).toBe('omit');
    expect(readWrittenConfig(result!.configPath).mcpServers).not.toHaveProperty('ouroboros');
    await result!.cleanup();
  });
});

// ─── Settings cleanup invariant ──────────────────────────────────────────────

describe('settings cleanup — coherent state post-downgrade', () => {
  it('downgrade path emits direct-inject ouroboros XOR no entry — never both', async () => {
    applyConfig({
      internalMcpScope: 'task-gated',
      internalMcp: { transport: 'stdio' },
      codemode: { enabled: true, routeInternalMcp: true },
    });
    const result = await buildScopedMcpConfig({
      goalShape: 'code',
      sessionId: 'recovery-session-4',
      codemodeAcquireFailed: true,
      mainOutDir: FAKE_MAIN_OUT,
    });
    expect(result).not.toBeNull();
    const data = readWrittenConfig(result!.configPath);
    // The temp config built by the IDE only ever holds at most one `ouroboros`
    // key (Object semantics). The cleanup contract here is "no `__codemode_proxy`
    // sneaks in alongside ouroboros" — codemodeManager owns that entry, and
    // the failure path never wrote it.
    const keys = Object.keys(data.mcpServers);
    expect(keys.filter((k) => k === 'ouroboros').length).toBeLessThanOrEqual(1);
    expect(keys).not.toContain('__codemode_proxy');
    await result!.cleanup();
  });
});

// ─── Mid-spawn lifecycle: each spawn consults the policy fresh ───────────────

describe('repeated spawns are evaluated independently', () => {
  it('failure on spawn N does not poison spawn N+1 when acquire succeeds again', async () => {
    applyConfig({
      internalMcpScope: 'task-gated',
      internalMcp: { transport: 'stdio' },
      codemode: { enabled: true, routeInternalMcp: true },
    });

    // Spawn 1 — acquire failed, downgrade applies.
    const r1 = await buildScopedMcpConfig({
      goalShape: 'code',
      sessionId: 'spawn-1',
      codemodeAcquireFailed: true,
      mainOutDir: FAKE_MAIN_OUT,
    });
    expect(r1).not.toBeNull();
    expect(r1!.routingDecision).toBe('direct-inject');
    await r1!.cleanup();

    // Spawn 2 — acquire succeeded (no flag). Policy returns route-through-codemode.
    const r2 = await buildScopedMcpConfig({
      goalShape: 'code',
      sessionId: 'spawn-2',
      codemodeAcquireFailed: false,
      mainOutDir: FAKE_MAIN_OUT,
    });
    expect(r2).not.toBeNull();
    expect(r2!.routingDecision).toBe('route-through-codemode');
    await r2!.cleanup();
  });

  it('successive failures all downgrade, no escalation or state leak', async () => {
    applyConfig({
      internalMcpScope: 'task-gated',
      internalMcp: { transport: 'stdio' },
      codemode: { enabled: true, routeInternalMcp: true },
    });

    const decisions: RoutingDecision[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await buildScopedMcpConfig({
        goalShape: 'code',
        sessionId: `spawn-fail-${i}`,
        codemodeAcquireFailed: true,
        mainOutDir: FAKE_MAIN_OUT,
      });
      expect(r).not.toBeNull();
      decisions.push(r!.routingDecision);
      await r!.cleanup();
    }
    expect(decisions).toEqual(['direct-inject', 'direct-inject', 'direct-inject']);
  });
});

// ─── Telemetry under crash recovery ──────────────────────────────────────────

describe('telemetry records the downgraded decision, not the original', () => {
  it('records direct-inject when route-through-codemode was downgraded', async () => {
    applyConfig({
      internalMcpScope: 'task-gated',
      internalMcp: { transport: 'stdio' },
      codemode: { enabled: true, routeInternalMcp: true },
    });
    const result = await buildScopedMcpConfig({
      goalShape: 'code',
      sessionId: 'telemetry-recovery-1',
      codemodeAcquireFailed: true,
      mainOutDir: FAKE_MAIN_OUT,
    });
    expect(result).not.toBeNull();
    expect(mockAppendFile).toHaveBeenCalledTimes(1);
    const line = mockAppendFile.mock.calls[0][1] as string;
    const record = JSON.parse(line.trimEnd()) as {
      routingDecision: string;
      codemodeEnabled: boolean;
    };
    expect(record.routingDecision).toBe('direct-inject');
    // The flag itself is still on (the user didn't disable codemode); only
    // the per-spawn outcome was downgraded. This lets the rollup attribute
    // failures to the codemode path even when they fell back.
    expect(record.codemodeEnabled).toBe(true);
    await result!.cleanup();
  });
});
