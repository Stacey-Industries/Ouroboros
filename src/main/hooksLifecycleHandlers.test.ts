/**
 * hooksLifecycleHandlers.test.ts — Unit tests for new hook lifecycle handlers.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockOnCwdChanged = vi.fn();
const mockOnFileChanged = vi.fn();
const mockGraphOnFileChange = vi.fn();

vi.mock('./contextLayer/contextLayerController', () => ({
  getContextLayerController: () => ({
    onCwdChanged: mockOnCwdChanged,
    onFileChanged: mockOnFileChanged,
  }),
}));

vi.mock('./codebaseGraph/graphControllerSupport', () => ({
  getGraphController: () => ({
    onFileChange: mockGraphOnFileChange,
  }),
}));

vi.mock('./logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── Import after mocks ───────────────────────────────────────────────────────

import {
  clearPermissionContext,
  enrichFromPermissionRequest,
  getPermissionContext,
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('notifies context layer and graph on external file changes', () => {
    handleFileChanged({});
    expect(mockOnFileChanged).toHaveBeenCalled();
    expect(mockGraphOnFileChange).toHaveBeenCalled();
  });

  it('skips notification for internal sessions', () => {
    handleFileChanged({ internal: true });
    expect(mockOnFileChanged).not.toHaveBeenCalled();
    expect(mockGraphOnFileChange).not.toHaveBeenCalled();
  });
});

describe('handleConfigChange', () => {
  it('runs without throwing', () => {
    expect(() => handleConfigChange('session-123')).not.toThrow();
  });
});

describe('enrichFromPermissionRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs without throwing for a minimal payload', () => {
    expect(() => enrichFromPermissionRequest({ sessionId: 'abc' })).not.toThrow();
  });

  it('stores context in the cache when data and toolName are provided', () => {
    enrichFromPermissionRequest({
      sessionId: 'sess1',
      toolName: 'Bash',
      data: { permissionType: 'shell_exec', matchedRule: 'allow-bash' },
    });
    const ctx = getPermissionContext('sess1', 'Bash');
    expect(ctx).toMatchObject({
      permissionType: 'shell_exec',
      matchedRule: 'allow-bash',
    });
  });

  it('getPermissionContext evicts on first read', () => {
    enrichFromPermissionRequest({
      sessionId: 'sess2',
      toolName: 'Write',
      data: { permissionType: 'file_write' },
    });
    // First read returns the value
    const first = getPermissionContext('sess2', 'Write');
    expect(first?.permissionType).toBe('file_write');
    // Second read returns undefined (evicted)
    const second = getPermissionContext('sess2', 'Write');
    expect(second).toBeUndefined();
  });

  it('clearPermissionContext removes the entry before it is read', () => {
    enrichFromPermissionRequest({
      sessionId: 'sess3',
      toolName: 'Edit',
      data: { permissionType: 'file_edit' },
    });
    clearPermissionContext('sess3', 'Edit');
    expect(getPermissionContext('sess3', 'Edit')).toBeUndefined();
  });
});
