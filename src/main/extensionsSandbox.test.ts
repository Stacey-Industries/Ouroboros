import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./config', () => ({
  getConfigValue: vi.fn(),
}));
vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
  },
}));
vi.mock('./pty', () => ({
  writeToPty: vi.fn(),
}));
vi.mock('./web/webServer', () => ({
  broadcastToWebClients: vi.fn(),
}));
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
}));
vi.mock('./ipc-handlers/pathSecurity', () => ({
  validatePathInWorkspace: vi.fn(),
}));

import { getConfigValue } from './config';
import { validatePathInWorkspace } from './ipc-handlers/pathSecurity';
import type { LoadedExtension } from './extensionsTypes';
import { appendLog, buildSandboxAPI, getSafeSandboxGlobals } from './extensionsSandbox';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeExt(permissions: string[] = []): LoadedExtension {
  return {
    manifest: {
      name: 'test-ext',
      version: '1.0.0',
      description: '',
      author: '',
      main: 'index.js',
      permissions,
    },
    dir: '/fake/ext',
    enabled: true,
    status: 'active',
    log: [],
    registeredCommands: new Map(),
    context: null,
  };
}

const ALL_PERMISSIONS = [
  'files.read',
  'files.write',
  'terminal.write',
  'config.read',
  'commands.register',
];

// ---------------------------------------------------------------------------
// Permission gates
// ---------------------------------------------------------------------------

describe('permission gates', () => {
  it('files.readFile throws without files.read permission', async () => {
    const ext = makeExt([]);
    const api = buildSandboxAPI(ext);
    const readFile = (api.ouroboros as Record<string, Record<string, Function>>).files.readFile;
    await expect(readFile('/some/file.txt')).rejects.toThrow(
      'Permission denied: files.read not granted',
    );
  });

  it('files.writeFile throws without files.write permission', async () => {
    const ext = makeExt([]);
    const api = buildSandboxAPI(ext);
    const writeFile = (api.ouroboros as Record<string, Record<string, Function>>).files.writeFile;
    await expect(writeFile('/some/file.txt', 'content')).rejects.toThrow(
      'Permission denied: files.write not granted',
    );
  });

  it('terminal.write throws without terminal.write permission', async () => {
    const ext = makeExt([]);
    const api = buildSandboxAPI(ext);
    const write = (api.ouroboros as Record<string, Record<string, Function>>).terminal.write;
    await expect(write('tab1', 'data')).rejects.toThrow(
      'Permission denied: terminal.write not granted',
    );
  });

  it('config.get throws without config.read permission', () => {
    const ext = makeExt([]);
    const api = buildSandboxAPI(ext);
    const get = (api.ouroboros as Record<string, Record<string, Function>>).config.get;
    expect(() => get('activeTheme')).toThrow('Permission denied: config.read not granted');
  });

  it('commands.register throws without commands.register permission', () => {
    const ext = makeExt([]);
    const api = buildSandboxAPI(ext);
    const register = (api.ouroboros as Record<string, Record<string, Function>>).commands.register;
    expect(() => register('my-cmd', () => {})).toThrow(
      'Permission denied: commands.register not granted',
    );
  });
});

// ---------------------------------------------------------------------------
// Config masking
// ---------------------------------------------------------------------------

describe('config masking (sanitizeForExtension)', () => {
  beforeEach(() => {
    vi.mocked(getConfigValue).mockImplementation((key) => {
      if (key === 'modelProviders') {
        return [{ id: 'openai', apiKey: 'sk-secret-key' }];
      }
      if (key === 'webAccessToken') return 'real-token';
      if (key === 'webAccessPassword') return 'real-password';
      if (key === 'activeTheme') return 'retro';
      return null;
    });
  });

  it('masks apiKey in modelProviders', () => {
    const ext = makeExt(['config.read']);
    const api = buildSandboxAPI(ext);
    const get = (api.ouroboros as Record<string, Record<string, Function>>).config.get;
    const providers = get('modelProviders') as Array<Record<string, unknown>>;
    expect(providers[0].apiKey).toBe('••••••••');
  });

  it('returns empty string for webAccessToken', () => {
    const ext = makeExt(['config.read']);
    const api = buildSandboxAPI(ext);
    const get = (api.ouroboros as Record<string, Record<string, Function>>).config.get;
    expect(get('webAccessToken')).toBe('');
  });

  it('returns empty string for webAccessPassword', () => {
    const ext = makeExt(['config.read']);
    const api = buildSandboxAPI(ext);
    const get = (api.ouroboros as Record<string, Record<string, Function>>).config.get;
    expect(get('webAccessPassword')).toBe('');
  });

  it('returns real value for non-sensitive keys', () => {
    const ext = makeExt(['config.read']);
    const api = buildSandboxAPI(ext);
    const get = (api.ouroboros as Record<string, Record<string, Function>>).config.get;
    expect(get('activeTheme')).toBe('retro');
  });

  it('masks apiKey as empty string when provider has no apiKey', () => {
    vi.mocked(getConfigValue).mockImplementation((key) => {
      if (key === 'modelProviders') return [{ id: 'local' }];
      return null;
    });
    const ext = makeExt(['config.read']);
    const api = buildSandboxAPI(ext);
    const get = (api.ouroboros as Record<string, Record<string, Function>>).config.get;
    const providers = get('modelProviders') as Array<Record<string, unknown>>;
    expect(providers[0].apiKey).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Path validation
// ---------------------------------------------------------------------------

describe('path validation', () => {
  it('files.readFile throws "Permission denied" for paths outside workspace roots', async () => {
    vi.mocked(getConfigValue).mockReturnValue(null);
    vi.mocked(validatePathInWorkspace).mockReturnValue('path is outside workspace roots');

    const ext = makeExt(['files.read']);
    const api = buildSandboxAPI(ext);
    const readFile = (api.ouroboros as Record<string, Record<string, Function>>).files.readFile;
    await expect(readFile('../../../etc/passwd')).rejects.toThrow('Permission denied');
  });

  it('files.readFile succeeds when path is within workspace roots', async () => {
    vi.mocked(getConfigValue).mockImplementation((key) => {
      if (key === 'multiRoots') return ['/workspace'];
      return null;
    });
    vi.mocked(validatePathInWorkspace).mockReturnValue(null);

    const fsPromises = await import('fs/promises');
    vi.mocked(fsPromises.default.readFile).mockResolvedValue('file contents' as never);

    const ext = makeExt(['files.read']);
    const api = buildSandboxAPI(ext);
    const readFile = (api.ouroboros as Record<string, Record<string, Function>>).files.readFile;
    const result = await readFile('/workspace/myfile.ts');
    expect(result).toBe('file contents');
  });
});

// ---------------------------------------------------------------------------
// Safe globals
// ---------------------------------------------------------------------------

describe('getSafeSandboxGlobals', () => {
  it('includes expected safe constructors and utilities', () => {
    const globals = getSafeSandboxGlobals();
    const expected = [
      'Promise',
      'JSON',
      'Math',
      'Date',
      'Array',
      'Object',
      'String',
      'Number',
      'Boolean',
      'Map',
      'Set',
      'Symbol',
      'Error',
      'TypeError',
      'RangeError',
      'RegExp',
      'parseInt',
      'parseFloat',
      'isNaN',
      'isFinite',
      'encodeURIComponent',
      'decodeURIComponent',
      'encodeURI',
      'decodeURI',
    ];
    for (const key of expected) {
      expect(globals).toHaveProperty(key);
    }
  });

  it('does not include dangerous globals', () => {
    const globals = getSafeSandboxGlobals();
    const forbidden = ['process', 'require', 'fs', 'child_process', 'eval', 'Function'];
    for (const key of forbidden) {
      expect(globals).not.toHaveProperty(key);
    }
  });
});

// ---------------------------------------------------------------------------
// Console proxy
// ---------------------------------------------------------------------------

describe('console proxy', () => {
  it('console.log appends to ext.log', () => {
    const ext = makeExt(ALL_PERMISSIONS);
    const api = buildSandboxAPI(ext);
    api.console.log('hello world');
    expect(ext.log.length).toBe(1);
    expect(ext.log[0]).toContain('hello world');
  });

  it('log entries include a timestamp prefix', () => {
    const ext = makeExt(ALL_PERMISSIONS);
    const api = buildSandboxAPI(ext);
    api.console.log('test message');
    // Timestamp format is [HH:MM:SS.mmm] produced by toISOString().slice(11,23)
    expect(ext.log[0]).toMatch(/^\[\d{2}:\d{2}:\d{2}\.\d{3}\]/);
  });

  it('console.warn appends to ext.log with [warn] prefix', () => {
    const ext = makeExt(ALL_PERMISSIONS);
    const api = buildSandboxAPI(ext);
    api.console.warn('something wrong');
    expect(ext.log[0]).toContain('[warn]');
    expect(ext.log[0]).toContain('something wrong');
  });

  it('console.error appends to ext.log with [error] prefix', () => {
    const ext = makeExt(ALL_PERMISSIONS);
    const api = buildSandboxAPI(ext);
    api.console.error('an error');
    expect(ext.log[0]).toContain('[error]');
  });
});

// ---------------------------------------------------------------------------
// appendLog
// ---------------------------------------------------------------------------

describe('appendLog', () => {
  it('appends a timestamped entry', () => {
    const ext = makeExt();
    appendLog(ext, 'hello');
    expect(ext.log.length).toBe(1);
    expect(ext.log[0]).toContain('hello');
    expect(ext.log[0]).toMatch(/^\[\d{2}:\d{2}:\d{2}\.\d{3}\]/);
  });

  it('caps log at 500 entries', () => {
    const ext = makeExt();
    for (let i = 0; i < 510; i++) {
      appendLog(ext, `entry ${i}`);
    }
    expect(ext.log.length).toBe(500);
  });

  it('retains the most recent entries when capping', () => {
    const ext = makeExt();
    for (let i = 0; i < 510; i++) {
      appendLog(ext, `entry ${i}`);
    }
    expect(ext.log[ext.log.length - 1]).toContain('entry 509');
  });
});
