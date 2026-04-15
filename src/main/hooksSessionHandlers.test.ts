/**
 * hooksSessionHandlers.test.ts — Unit tests for session lifecycle handlers.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks (must use vi.hoisted so factories run before vi.mock) ───────

const {
  mockOnSessionStart,
  mockGraphOnSessionStart,
  mockOnGitCommit,
  mockGraphOnGitCommit,
  mockDispatchActivation,
  mockInvalidateCache,
  mockGenerateClaudeMd,
  mockGetConfigValue,
} = vi.hoisted(() => ({
  mockOnSessionStart: vi.fn(),
  mockGraphOnSessionStart: vi.fn(),
  mockOnGitCommit: vi.fn(),
  mockGraphOnGitCommit: vi.fn(),
  mockDispatchActivation: vi.fn().mockResolvedValue(undefined),
  mockInvalidateCache: vi.fn(),
  mockGenerateClaudeMd: vi.fn().mockResolvedValue(undefined),
  mockGetConfigValue: vi.fn(),
}));

vi.mock('./contextLayer/contextLayerController', () => ({
  getContextLayerController: () => ({
    onSessionStart: mockOnSessionStart,
    onGitCommit: mockOnGitCommit,
  }),
}));

vi.mock('./codebaseGraph/graphControllerSupport', () => ({
  getGraphController: () => ({
    onSessionStart: mockGraphOnSessionStart,
    onGitCommit: mockGraphOnGitCommit,
  }),
}));

vi.mock('./extensions', () => ({
  dispatchActivationEvent: mockDispatchActivation,
}));

vi.mock('./ipc-handlers/agentChat', () => ({
  invalidateSnapshotCache: mockInvalidateCache,
}));

vi.mock('./claudeMdGenerator', () => ({
  generateClaudeMd: mockGenerateClaudeMd,
}));

vi.mock('./config', () => ({
  getConfigValue: mockGetConfigValue,
}));

vi.mock('./logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── Import after mocks ───────────────────────────────────────────────────────

import type { HookPayload } from './hooks';
import {
  handleSessionEnd,
  handleSessionStart,
  handleSessionStop,
  triggerClaudeMdGeneration,
} from './hooksSessionHandlers';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePayload(overrides: Partial<HookPayload> = {}): HookPayload {
  return {
    type: 'session_start',
    sessionId: 'test-session',
    timestamp: Date.now(),
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('handleSessionStart', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('dispatches activation event', () => {
    handleSessionStart(makePayload());
    expect(mockDispatchActivation).toHaveBeenCalledWith('onSessionStart', { sessionId: 'test-session' });
  });

  it('notifies context layer and graph for external sessions', () => {
    handleSessionStart(makePayload({ internal: false }));
    expect(mockOnSessionStart).toHaveBeenCalled();
    expect(mockGraphOnSessionStart).toHaveBeenCalled();
  });

  it('skips context layer and graph for internal sessions', () => {
    handleSessionStart(makePayload({ internal: true }));
    expect(mockOnSessionStart).not.toHaveBeenCalled();
    expect(mockGraphOnSessionStart).not.toHaveBeenCalled();
  });
});

describe('handleSessionEnd', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('dispatches onSessionEnd activation event', () => {
    handleSessionEnd(makePayload({ type: 'session_end' }));
    expect(mockDispatchActivation).toHaveBeenCalledWith('onSessionEnd', { sessionId: 'test-session' });
  });
});

describe('handleSessionStop', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('notifies context layer, graph, and invalidates cache for external sessions', () => {
    mockGetConfigValue.mockReturnValue(undefined);
    const map = new Map<string, string>();
    handleSessionStop(makePayload({ type: 'session_stop' }), map);
    expect(mockOnGitCommit).toHaveBeenCalled();
    expect(mockGraphOnGitCommit).toHaveBeenCalled();
    expect(mockInvalidateCache).toHaveBeenCalled();
  });

  it('skips all side effects for internal sessions', () => {
    const map = new Map<string, string>();
    handleSessionStop(makePayload({ type: 'session_stop', internal: true }), map);
    expect(mockOnGitCommit).not.toHaveBeenCalled();
    expect(mockInvalidateCache).not.toHaveBeenCalled();
  });
});

describe('triggerClaudeMdGeneration', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('skips when config is disabled', () => {
    mockGetConfigValue.mockReturnValue({ enabled: false, triggerMode: 'post-session' });
    const map = new Map<string, string>();
    triggerClaudeMdGeneration('post-session', makePayload({ cwd: '/project' }), map);
    expect(mockGenerateClaudeMd).not.toHaveBeenCalled();
  });

  it('skips when trigger mode does not match', () => {
    mockGetConfigValue.mockReturnValue({ enabled: true, triggerMode: 'post-commit' });
    const map = new Map<string, string>();
    triggerClaudeMdGeneration('post-session', makePayload({ cwd: '/project' }), map);
    expect(mockGenerateClaudeMd).not.toHaveBeenCalled();
  });

  it('generates when enabled and trigger matches, using payload.cwd', () => {
    mockGetConfigValue.mockReturnValue({ enabled: true, triggerMode: 'post-session' });
    const map = new Map<string, string>();
    triggerClaudeMdGeneration('post-session', makePayload({ cwd: '/project' }), map);
    expect(mockGenerateClaudeMd).toHaveBeenCalledWith('/project');
  });

  it('falls back to sessionCwdMap when payload.cwd is absent', () => {
    mockGetConfigValue.mockReturnValue({ enabled: true, triggerMode: 'post-session' });
    const map = new Map([['test-session', '/from-map']]);
    triggerClaudeMdGeneration('post-session', makePayload({ cwd: undefined }), map);
    expect(mockGenerateClaudeMd).toHaveBeenCalledWith('/from-map');
  });

  it('skips when no project root can be determined', () => {
    mockGetConfigValue.mockReturnValue({ enabled: true, triggerMode: 'post-session' });
    const map = new Map<string, string>();
    triggerClaudeMdGeneration('post-session', makePayload({ cwd: undefined }), map);
    expect(mockGenerateClaudeMd).not.toHaveBeenCalled();
  });
});
