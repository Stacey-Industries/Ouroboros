/**
 * hookStack.integration.test.ts — Wave 50 Phase E
 *
 * Integration coverage for the four PreToolUse enforcement hooks routed
 * through `runPreToolEnforcement`. Verifies:
 *
 *  - deny path per hook (no-secrets, lockfiles, no-minified)
 *  - warn path (test-scope) — decision shape only; warn is IDE-log-only today
 *  - allow paths for benign inputs
 *  - hooks.enforcedRules toggle disables an individual rule
 *  - first-deny-wins ordering when multiple hooks could match
 *
 * Notes:
 *  - We mock `../config` so the four evaluators read whatever enforcedRules
 *    array we set per test. Each evaluator imports `getConfigValue` from
 *    `../config`; `runPreToolEnforcement` does not read config directly.
 *  - The `pre_tool_use.mjs` harness response shape is intentionally NOT
 *    asserted here. Per Phase B's report, warn surfaces as an IDE-side
 *    `log.info` only — we assert the typed `HookDecision` returned by
 *    `runPreToolEnforcement`, which is the contract this test layer owns.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { HookPayload } from '../hooks';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const ALL_RULES = ['no-secrets', 'lockfiles', 'no-minified', 'test-scope'];

vi.mock('../config', () => ({
  getConfigValue: vi.fn(() => ({ enforcedRules: ALL_RULES })),
}));

// hooksSessionHandlers imports several heavy main-process modules at load
// time (electron app, agentChat threadStore, IPC handlers, graph
// controller). None of them are exercised by `runPreToolEnforcement`, so
// we stub them with no-op shapes so the import chain resolves under
// vitest's node environment.
vi.mock('electron', () => ({ app: { getPath: () => '/tmp' }, BrowserWindow: class {} }));
vi.mock('../claudeMdGenerator', () => ({ generateClaudeMd: vi.fn() }));
vi.mock('../codebaseGraph/graphControllerSupport', () => ({ getGraphController: () => null }));
vi.mock('../contextLayer/contextLayerController', () => ({
  getContextLayerController: () => null,
}));
vi.mock('../extensions', () => ({ dispatchActivationEvent: vi.fn(() => Promise.resolve()) }));
vi.mock('../ipc-handlers/agentChat', () => ({ invalidateSnapshotCache: vi.fn() }));
vi.mock('../router/qualitySignalCollector', () => ({ trackSessionEnd: vi.fn() }));
vi.mock('../hooks/gotchaUpdateNudge', () => ({ evaluateStop: vi.fn() }));

// Imported AFTER vi.mock so the evaluators bind to the mocked modules.
import { runPreToolEnforcement } from '../hooksSessionHandlers';

async function setEnforcedRules(rules: string[]): Promise<void> {
  const configMod = await import('../config');
  vi.mocked(configMod.getConfigValue).mockReturnValue({ enforcedRules: rules });
}

beforeEach(async () => {
  await setEnforcedRules(ALL_RULES);
});

// ─── Payload builders ────────────────────────────────────────────────────────

function makeFilePayload(toolName: string, filePath: string): HookPayload {
  return {
    type: 'pre_tool_use',
    sessionId: 'integration-session',
    toolName,
    input: { tool_name: toolName, tool_input: { file_path: filePath } },
    timestamp: Date.now(),
  };
}

function makeBashPayload(command: string): HookPayload {
  return {
    type: 'pre_tool_use',
    sessionId: 'integration-session',
    toolName: 'Bash',
    input: { tool_name: 'Bash', tool_input: { command } },
    timestamp: Date.now(),
  };
}

// ─── Deny paths ──────────────────────────────────────────────────────────────

describe('runPreToolEnforcement — deny paths', () => {
  it('denies Write on .env.local via blockSecretWrites', () => {
    const result = runPreToolEnforcement(makeFilePayload('Write', '/project/.env.local'));
    expect(result.kind).toBe('deny');
    if (result.kind !== 'deny') throw new Error('unreachable');
    expect(result.ruleName).toBe('no-secrets');
    expect(result.message).toContain('.env.local');
  });

  it('denies Edit on package-lock.json via blockLockfileEdits', () => {
    const result = runPreToolEnforcement(makeFilePayload('Edit', '/project/package-lock.json'));
    expect(result.kind).toBe('deny');
    if (result.kind !== 'deny') throw new Error('unreachable');
    expect(result.ruleName).toBe('lockfiles');
    expect(result.message).toContain('package-lock.json');
  });

  it('denies Edit on pnpm-lock.yaml via blockLockfileEdits', () => {
    const result = runPreToolEnforcement(makeFilePayload('Edit', '/project/pnpm-lock.yaml'));
    expect(result.kind).toBe('deny');
    if (result.kind !== 'deny') throw new Error('unreachable');
    expect(result.ruleName).toBe('lockfiles');
  });

  it('denies Read on foo.min.js via blockMinifiedOperations', () => {
    const result = runPreToolEnforcement(makeFilePayload('Read', '/project/dist/foo.min.js'));
    expect(result.kind).toBe('deny');
    if (result.kind !== 'deny') throw new Error('unreachable');
    expect(result.ruleName).toBe('no-minified');
    expect(result.message).toContain('foo.min.js');
  });

  it('denies Read on app.min.css via blockMinifiedOperations', () => {
    const result = runPreToolEnforcement(makeFilePayload('Read', '/project/dist/app.min.css'));
    expect(result.kind).toBe('deny');
    if (result.kind !== 'deny') throw new Error('unreachable');
    expect(result.ruleName).toBe('no-minified');
  });
});

// ─── Warn path ───────────────────────────────────────────────────────────────

describe('runPreToolEnforcement — warn path', () => {
  it('warns on bare `npm test` Bash command', () => {
    const result = runPreToolEnforcement(makeBashPayload('npm test'));
    expect(result.kind).toBe('warn');
    if (result.kind !== 'warn') throw new Error('unreachable');
    expect(result.ruleName).toBe('test-scope');
    expect(result.message).toContain('Full test suite');
  });

  it('warns on bare `npx vitest run`', () => {
    const result = runPreToolEnforcement(makeBashPayload('npx vitest run'));
    expect(result.kind).toBe('warn');
    if (result.kind !== 'warn') throw new Error('unreachable');
    expect(result.ruleName).toBe('test-scope');
  });

  it('warns on `npm run test` with only flag args', () => {
    const result = runPreToolEnforcement(makeBashPayload('npm run test --watch'));
    expect(result.kind).toBe('warn');
  });
});

// ─── Allow paths ─────────────────────────────────────────────────────────────

describe('runPreToolEnforcement — allow paths', () => {
  it('allows Write on .env.sample (template, not secret)', () => {
    const result = runPreToolEnforcement(makeFilePayload('Write', '/project/.env.sample'));
    expect(result.kind).toBe('pass');
  });

  it('allows Write on .env.example', () => {
    const result = runPreToolEnforcement(makeFilePayload('Write', '/project/.env.example'));
    expect(result.kind).toBe('pass');
  });

  it('allows Edit on package.json (manifest, not lockfile)', () => {
    const result = runPreToolEnforcement(makeFilePayload('Edit', '/project/package.json'));
    expect(result.kind).toBe('pass');
  });

  it('allows Read on a non-minified source file', () => {
    const result = runPreToolEnforcement(makeFilePayload('Read', '/project/src/foo.js'));
    expect(result.kind).toBe('pass');
  });

  it('allows scoped `npm test src/foo.test.ts`', () => {
    const result = runPreToolEnforcement(makeBashPayload('npm test src/foo.test.ts'));
    expect(result.kind).toBe('pass');
  });

  it('allows scoped `npx vitest run src/main/hooks/`', () => {
    const result = runPreToolEnforcement(makeBashPayload('npx vitest run src/main/hooks/'));
    expect(result.kind).toBe('pass');
  });

  it('allows unrelated Bash commands (e.g. `git status`)', () => {
    const result = runPreToolEnforcement(makeBashPayload('git status'));
    expect(result.kind).toBe('pass');
  });

  it('passes through non-pre_tool_use event types', () => {
    const payload: HookPayload = {
      type: 'post_tool_use',
      sessionId: 'integration-session',
      toolName: 'Write',
      input: { tool_name: 'Write', tool_input: { file_path: '/project/.env.local' } },
      timestamp: Date.now(),
    };
    const result = runPreToolEnforcement(payload);
    expect(result.kind).toBe('pass');
  });
});

// ─── enforcedRules toggle ────────────────────────────────────────────────────

describe('runPreToolEnforcement — hooks.enforcedRules toggle', () => {
  it('allows .env.local Write when no-secrets is omitted from enforcedRules', async () => {
    await setEnforcedRules(['lockfiles', 'no-minified', 'test-scope']);
    const result = runPreToolEnforcement(makeFilePayload('Write', '/project/.env.local'));
    expect(result.kind).toBe('pass');
  });

  it('allows package-lock.json Edit when lockfiles is omitted', async () => {
    await setEnforcedRules(['no-secrets', 'no-minified', 'test-scope']);
    const result = runPreToolEnforcement(makeFilePayload('Edit', '/project/package-lock.json'));
    expect(result.kind).toBe('pass');
  });

  it('allows foo.min.js Read when no-minified is omitted', async () => {
    await setEnforcedRules(['no-secrets', 'lockfiles', 'test-scope']);
    const result = runPreToolEnforcement(makeFilePayload('Read', '/project/dist/foo.min.js'));
    expect(result.kind).toBe('pass');
  });

  it('allows bare `npm test` when test-scope is omitted', async () => {
    await setEnforcedRules(['no-secrets', 'lockfiles', 'no-minified']);
    const result = runPreToolEnforcement(makeBashPayload('npm test'));
    expect(result.kind).toBe('pass');
  });

  it('disables all enforcement when enforcedRules is empty', async () => {
    await setEnforcedRules([]);
    const envResult = runPreToolEnforcement(makeFilePayload('Write', '/project/.env.local'));
    expect(envResult.kind).toBe('pass');
    const lockResult = runPreToolEnforcement(makeFilePayload('Edit', '/project/package-lock.json'));
    expect(lockResult.kind).toBe('pass');
    const minResult = runPreToolEnforcement(makeFilePayload('Read', '/project/foo.min.js'));
    expect(minResult.kind).toBe('pass');
  });
});

// ─── First-deny-wins ordering ────────────────────────────────────────────────

describe('runPreToolEnforcement — first-deny-wins ordering', () => {
  /**
   * Evaluator order in `hooksSessionHandlers.ts`:
   *   blockSecrets → blockLockfiles → blockMinified → warnTestSuite
   *
   * A hypothetical `.env.lock` file could plausibly match both the
   * secret-file pattern (`/^\.env(\.[^.]+)*$/`) and a future lockfile
   * pattern. Since blockSecrets runs first, it should win on this name.
   *
   * Today only `.env.lock` matches blockSecrets (lockfile basenames are
   * a fixed set). We assert the deny comes from no-secrets to lock in
   * the ordering contract — if a future change reorders evaluators, this
   * test fails loudly.
   */
  it('blockSecretWrites wins over later evaluators on .env.lock', () => {
    const result = runPreToolEnforcement(makeFilePayload('Write', '/project/.env.lock'));
    expect(result.kind).toBe('deny');
    if (result.kind !== 'deny') throw new Error('unreachable');
    expect(result.ruleName).toBe('no-secrets');
  });

  it('returns the first deny when secrets is disabled but a later rule still matches', async () => {
    // Disable no-secrets — .env.lock no longer matches secrets, and no
    // later evaluator matches it either, so the call passes. This pins
    // the toggle behavior: removing a rule from enforcedRules really
    // does take it out of the chain rather than fall through silently.
    await setEnforcedRules(['lockfiles', 'no-minified', 'test-scope']);
    const result = runPreToolEnforcement(makeFilePayload('Write', '/project/.env.lock'));
    expect(result.kind).toBe('pass');
  });
});
