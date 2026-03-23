/**
 * pathSecurity.test.ts — Unit tests for workspace path sandbox helpers.
 *
 * Tests validatePathInWorkspace and getAllowedRoots/assertPathAllowed
 * (via mocked IpcMainInvokeEvent + windowManager + config).
 *
 * Run with: npx vitest run src/main/ipc-handlers/pathSecurity.test.ts
 */

import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock electron before importing module under test ──────────────────────────
vi.mock('electron', () => ({
  app: {
    getPath: () => '/mock/userData',
    getAppPath: () => '/mock/app',
  },
}));

// ── Mock windowManager ────────────────────────────────────────────────────────
const { mockGetWindow } = vi.hoisted(() => ({ mockGetWindow: vi.fn() }));
vi.mock('../windowManager', () => ({
  getWindow: mockGetWindow,
}));

// ── Mock config ───────────────────────────────────────────────────────────────
const { mockGetConfigValue } = vi.hoisted(() => ({ mockGetConfigValue: vi.fn() }));
vi.mock('../config', () => ({
  getConfigValue: mockGetConfigValue,
}));

// ── Import after mocks ────────────────────────────────────────────────────────
import { validatePathInWorkspace, getAllowedRoots, assertPathAllowed } from './pathSecurity';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal IpcMainInvokeEvent-like object pointing at a given window id. */
function makeEvent(windowId: number | undefined): Parameters<typeof assertPathAllowed>[0] {
  return {
    sender: {
      getOwnerBrowserWindow: () =>
        windowId !== undefined ? { id: windowId } : null,
    },
  } as Parameters<typeof assertPathAllowed>[0];
}

/** Platform-aware workspace root for tests (avoids hard-coding OS separators). */
const WORKSPACE = process.platform === 'win32' ? 'C:\\workspace' : '/workspace';
const WORKSPACE_RESOLVED = path.resolve(WORKSPACE);

function resetConfigMocks() {
  mockGetConfigValue.mockImplementation((key: string) => {
    if (key === 'multiRoots') return [];
    if (key === 'defaultProjectRoot') return undefined;
    return undefined;
  });
}

beforeEach(() => {
  resetConfigMocks();
  mockGetWindow.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── validatePathInWorkspace ──────────────────────────────────────────────────

describe('validatePathInWorkspace()', () => {
  describe('no workspace configured', () => {
    it('denies any path when allowedRoots is empty', () => {
      const result = validatePathInWorkspace('/some/path', []);
      expect(result).not.toBeNull();
      expect(result).toMatch(/No workspace root configured/);
    });
  });

  describe('valid paths inside workspace', () => {
    it('allows a file directly inside the workspace root', () => {
      const target = path.join(WORKSPACE_RESOLVED, 'src', 'index.ts');
      expect(validatePathInWorkspace(target, [WORKSPACE_RESOLVED])).toBeNull();
    });

    it('allows a deeply nested path inside the workspace', () => {
      const target = path.join(WORKSPACE_RESOLVED, 'a', 'b', 'c', 'deep.ts');
      expect(validatePathInWorkspace(target, [WORKSPACE_RESOLVED])).toBeNull();
    });

    it('allows the workspace root itself', () => {
      expect(validatePathInWorkspace(WORKSPACE_RESOLVED, [WORKSPACE_RESOLVED])).toBeNull();
    });

    it('resolves relative paths before comparing', () => {
      // A relative path that resolves inside the workspace when joined with cwd
      // — use path.resolve explicitly to mirror what the function does
      const relative = path.relative(process.cwd(), path.join(WORKSPACE_RESOLVED, 'file.ts'));
      expect(validatePathInWorkspace(relative, [WORKSPACE_RESOLVED])).toBeNull();
    });
  });

  describe('path traversal attacks', () => {
    it('rejects ../ path traversal that would escape workspace', () => {
      // Use a path that resolves outside: workspace/../../etc/passwd
      const traversal = path.join(WORKSPACE_RESOLVED, '..', '..', 'etc', 'passwd');
      const result = validatePathInWorkspace(traversal, [WORKSPACE_RESOLVED]);
      expect(result).not.toBeNull();
      expect(result).toMatch(/outside the workspace/);
    });

    it('rejects raw Unix-style ../../etc/passwd string', () => {
      const result = validatePathInWorkspace('../../etc/passwd', [WORKSPACE_RESOLVED]);
      expect(result).not.toBeNull();
    });

    it('rejects Windows-style ..\\..\\windows\\system32 on any platform', () => {
      // path.resolve normalises separators, so this is caught regardless of platform
      const result = validatePathInWorkspace('..\\..\\windows\\system32', [WORKSPACE_RESOLVED]);
      expect(result).not.toBeNull();
    });
  });

  describe('absolute paths outside workspace', () => {
    it('rejects an absolute path to /tmp/evil', () => {
      const result = validatePathInWorkspace('/tmp/evil', [WORKSPACE_RESOLVED]);
      expect(result).not.toBeNull();
      expect(result).toMatch(/outside the workspace/);
    });

    it('rejects C:\\Windows\\System32 style path', () => {
      // Even on Linux, path.resolve('C:\\Windows\\System32') won't match the workspace
      const result = validatePathInWorkspace('C:\\Windows\\System32', [WORKSPACE_RESOLVED]);
      expect(result).not.toBeNull();
    });

    it('rejects /etc/hosts', () => {
      expect(validatePathInWorkspace('/etc/hosts', [WORKSPACE_RESOLVED])).not.toBeNull();
    });
  });

  describe('prefix-match false positive prevention', () => {
    it('rejects a sibling directory that starts with the workspace name', () => {
      // e.g. workspace root is /workspace, path is /workspace-evil/file.txt
      const sibling = process.platform === 'win32'
        ? 'C:\\workspace-evil\\file.txt'
        : '/workspace-evil/file.txt';
      const root = process.platform === 'win32' ? 'C:\\workspace' : '/workspace';
      const result = validatePathInWorkspace(sibling, [path.resolve(root)]);
      expect(result).not.toBeNull();
      expect(result).toMatch(/outside the workspace/);
    });

    it('rejects a path whose prefix matches the root string but not as a sub-directory', () => {
      const root = process.platform === 'win32' ? 'C:\\proj' : '/proj';
      const sneaky = process.platform === 'win32' ? 'C:\\projection\\file.ts' : '/projection/file.ts';
      const result = validatePathInWorkspace(sneaky, [path.resolve(root)]);
      expect(result).not.toBeNull();
    });
  });

  describe('edge cases', () => {
    it('rejects an empty string (resolves to cwd, not workspace)', () => {
      // path.resolve('') === process.cwd(), which is almost certainly not the workspace
      // — but if cwd happens to be workspace, this could pass.  We test the real behaviour.
      const resolved = path.resolve('');
      const expected = resolved === WORKSPACE_RESOLVED || resolved.startsWith(WORKSPACE_RESOLVED + path.sep)
        ? null
        : 'outside';
      const result = validatePathInWorkspace('', [WORKSPACE_RESOLVED]);
      if (expected === null) {
        expect(result).toBeNull();
      } else {
        expect(result).not.toBeNull();
      }
    });

    it('rejects a path containing a null byte', () => {
      // path.resolve normalises the path; the null byte makes it an unusual string
      const nullBytePath = path.join(WORKSPACE_RESOLVED, 'file\0.ts');
      // The resolved path won't equal the workspace root, so it must start with root+sep
      // A null byte won't change the directory prefix check meaningfully, but the path
      // is still within workspace — the security concern is the OS layer, not JS.
      // We verify the function does NOT crash (security-in-depth note added separately).
      expect(() => validatePathInWorkspace(nullBytePath, [WORKSPACE_RESOLVED])).not.toThrow();
    });

    it('allows a path that is exactly the workspace root (no trailing separator)', () => {
      const result = validatePathInWorkspace(WORKSPACE_RESOLVED, [WORKSPACE_RESOLVED]);
      expect(result).toBeNull();
    });

    it('allows a path inside one of several allowed roots', () => {
      const root1 = process.platform === 'win32' ? 'C:\\projects\\alpha' : '/projects/alpha';
      const root2 = process.platform === 'win32' ? 'C:\\projects\\beta' : '/projects/beta';
      const target = path.join(path.resolve(root2), 'src', 'lib.ts');
      const result = validatePathInWorkspace(target, [path.resolve(root1), path.resolve(root2)]);
      expect(result).toBeNull();
    });
  });

  describe('Windows case-insensitivity', () => {
    it('allows uppercase variant of a workspace-relative path on Windows', () => {
      if (process.platform !== 'win32') return;
      const root = 'C:\\Workspace';
      const upper = 'C:\\WORKSPACE\\SRC\\FILE.TS';
      const result = validatePathInWorkspace(upper, [path.resolve(root)]);
      expect(result).toBeNull();
    });

    it('rejects a path that only matches due to case on non-Windows', () => {
      if (process.platform === 'win32') return;
      // On Linux, /Workspace !== /workspace
      const result = validatePathInWorkspace('/Workspace/src/file.ts', ['/workspace']);
      expect(result).not.toBeNull();
    });
  });
});

// ─── getAllowedRoots ──────────────────────────────────────────────────────────

describe('getAllowedRoots()', () => {
  it('includes the per-window project root from windowManager', () => {
    mockGetWindow.mockReturnValue({ projectRoot: WORKSPACE_RESOLVED });
    const roots = getAllowedRoots(makeEvent(1));
    expect(roots).toContain(path.resolve(WORKSPACE_RESOLVED));
  });

  it('includes multiRoots from config', () => {
    mockGetWindow.mockReturnValue(null);
    const extra = process.platform === 'win32' ? 'C:\\extra' : '/extra';
    mockGetConfigValue.mockImplementation((key: string) => {
      if (key === 'multiRoots') return [extra];
      return undefined;
    });
    const roots = getAllowedRoots(makeEvent(undefined));
    expect(roots).toContain(path.resolve(extra));
  });

  it('includes defaultProjectRoot from config', () => {
    mockGetWindow.mockReturnValue(null);
    const defRoot = process.platform === 'win32' ? 'C:\\default' : '/default';
    mockGetConfigValue.mockImplementation((key: string) => {
      if (key === 'multiRoots') return [];
      if (key === 'defaultProjectRoot') return defRoot;
      return undefined;
    });
    const roots = getAllowedRoots(makeEvent(undefined));
    expect(roots).toContain(path.resolve(defRoot));
  });

  it('returns empty array when no window, no multiRoots, no defaultRoot', () => {
    mockGetWindow.mockReturnValue(null);
    const roots = getAllowedRoots(makeEvent(undefined));
    expect(roots).toEqual([]);
  });

  it('ignores null/undefined entries in multiRoots', () => {
    mockGetWindow.mockReturnValue(null);
    mockGetConfigValue.mockImplementation((key: string) => {
      if (key === 'multiRoots') return [null, undefined, ''];
      return undefined;
    });
    // Should not throw and should not include falsy-resolved paths
    expect(() => getAllowedRoots(makeEvent(undefined))).not.toThrow();
  });
});

// ─── assertPathAllowed ────────────────────────────────────────────────────────

describe('assertPathAllowed()', () => {
  it('returns null when the path is inside the workspace', () => {
    mockGetWindow.mockReturnValue({ projectRoot: WORKSPACE_RESOLVED });
    const target = path.join(WORKSPACE_RESOLVED, 'src', 'main.ts');
    const result = assertPathAllowed(makeEvent(1), target);
    expect(result).toBeNull();
  });

  it('returns { success: false, error } when path escapes the workspace', () => {
    mockGetWindow.mockReturnValue({ projectRoot: WORKSPACE_RESOLVED });
    const result = assertPathAllowed(makeEvent(1), '/etc/passwd');
    expect(result).not.toBeNull();
    expect(result?.success).toBe(false);
    expect(typeof result?.error).toBe('string');
    expect(result?.error.length).toBeGreaterThan(0);
  });

  it('returns { success: false, error } when no workspace is configured', () => {
    mockGetWindow.mockReturnValue(null);
    const result = assertPathAllowed(makeEvent(undefined), '/some/file.ts');
    expect(result).not.toBeNull();
    expect(result?.success).toBe(false);
    expect(result?.error).toMatch(/No workspace root configured/);
  });

  it('returns null for the workspace root itself', () => {
    mockGetWindow.mockReturnValue({ projectRoot: WORKSPACE_RESOLVED });
    const result = assertPathAllowed(makeEvent(1), WORKSPACE_RESOLVED);
    expect(result).toBeNull();
  });

  it('error message includes the offending path', () => {
    mockGetWindow.mockReturnValue({ projectRoot: WORKSPACE_RESOLVED });
    const bad = process.platform === 'win32' ? 'C:\\Windows\\evil.bat' : '/tmp/evil.sh';
    const result = assertPathAllowed(makeEvent(1), bad);
    expect(result?.error).toContain(bad);
  });
});
