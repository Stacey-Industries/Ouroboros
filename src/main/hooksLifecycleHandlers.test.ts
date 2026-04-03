/**
 * hooksLifecycleHandlers.test.ts — Unit tests for new hook lifecycle handlers.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockOnCwdChanged = vi.fn();
const mockOnFileChanged = vi.fn();
const mockGraphOnFileChanged = vi.fn();

vi.mock('./contextLayer/contextLayerController', () => ({
  getContextLayerController: () => ({
    onCwdChanged: mockOnCwdChanged,
    onFileChanged: mockOnFileChanged,
  }),
}));

vi.mock('./codebaseGraph/graphController', () => ({
  getGraphController: () => ({
    onFileChanged: mockGraphOnFileChanged,
  }),
}));

vi.mock('./logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── Import after mocks ───────────────────────────────────────────────────────

import {
  enrichFromPermissionRequest,
  handleConfigChange,
  handleCwdChanged,
  handleFileChanged,
} from './hooksLifecycleHandlers';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('handleCwdChanged', () => {
  let sessionCwdMap: Map<string, string>;

  beforeEach(() => {
    sessionCwdMap = new Map();
    vi.clearAllMocks();
  });

  it('updates sessionCwdMap from payload.cwd', () => {
    handleCwdChanged(sessionCwdMap, { sessionId: 'abc', cwd: '/foo/bar' });
    expect(sessionCwdMap.get('abc')).toBe('/foo/bar');
    expect(mockOnCwdChanged).toHaveBeenCalledWith('/foo/bar');
  });

  it('prefers data.cwd over payload.cwd', () => {
    handleCwdChanged(sessionCwdMap, {
      sessionId: 'abc',
      cwd: '/old',
      data: { cwd: '/new' },
    });
    expect(sessionCwdMap.get('abc')).toBe('/new');
    expect(mockOnCwdChanged).toHaveBeenCalledWith('/new');
  });

  it('does nothing when no cwd is available', () => {
    handleCwdChanged(sessionCwdMap, { sessionId: 'abc' });
    expect(sessionCwdMap.size).toBe(0);
    expect(mockOnCwdChanged).not.toHaveBeenCalled();
  });
});

describe('handleFileChanged', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('notifies context layer and graph on external file changes', () => {
    handleFileChanged({});
    expect(mockOnFileChanged).toHaveBeenCalled();
    expect(mockGraphOnFileChanged).toHaveBeenCalled();
  });

  it('skips notification for internal sessions', () => {
    handleFileChanged({ internal: true });
    expect(mockOnFileChanged).not.toHaveBeenCalled();
    expect(mockGraphOnFileChanged).not.toHaveBeenCalled();
  });
});

describe('handleConfigChange', () => {
  it('runs without throwing', () => {
    expect(() => handleConfigChange('session-123')).not.toThrow();
  });
});

describe('enrichFromPermissionRequest', () => {
  it('runs without throwing for a minimal payload', () => {
    expect(() =>
      enrichFromPermissionRequest({ sessionId: 'abc' }),
    ).not.toThrow();
  });

  it('runs without throwing when data and toolName are provided', () => {
    expect(() =>
      enrichFromPermissionRequest({
        sessionId: 'abc',
        toolName: 'Bash',
        data: { permissionType: 'shell_exec' },
      }),
    ).not.toThrow();
  });
});
