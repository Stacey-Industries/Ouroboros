import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetConfigValue = vi.fn();
const mockSetConfigValue = vi.fn();
const mockMigrateFromPlaintext = vi.fn();
const mockWarmCache = vi.fn();
const mockIsSecureStorageAvailable = vi.fn(() => true);

vi.mock('../../config', () => ({
  getConfigValue: (...args: unknown[]) => mockGetConfigValue(...args),
  setConfigValue: (...args: unknown[]) => mockSetConfigValue(...args),
}));

vi.mock('../secureKeyStore', () => ({
  isSecureStorageAvailable: () => mockIsSecureStorageAvailable(),
  migrateFromPlaintext: (...args: unknown[]) => mockMigrateFromPlaintext(...args),
  warmCache: () => mockWarmCache(),
}));

vi.mock('../../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

import { migrateSecretsIfNeeded } from '../secretMigration';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function configReturns(overrides: Record<string, unknown>): void {
  mockGetConfigValue.mockImplementation((key: string) => {
    if (key in overrides) return overrides[key as keyof typeof overrides];
    return undefined;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('secretMigration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSecureStorageAvailable.mockReturnValue(true);
    mockWarmCache.mockResolvedValue(undefined);
    mockMigrateFromPlaintext.mockResolvedValue(true);
  });

  it('warms the cache on every call', async () => {
    configReturns({ _secrets_migrated: true });
    await migrateSecretsIfNeeded();
    expect(mockWarmCache).toHaveBeenCalledTimes(1);
  });

  it('skips migration when safeStorage unavailable', async () => {
    mockIsSecureStorageAvailable.mockReturnValue(false);
    configReturns({});
    await migrateSecretsIfNeeded();
    expect(mockMigrateFromPlaintext).not.toHaveBeenCalled();
  });

  it('skips when already migrated', async () => {
    configReturns({ _secrets_migrated: true });
    await migrateSecretsIfNeeded();
    expect(mockMigrateFromPlaintext).not.toHaveBeenCalled();
  });

  it('migrates provider API keys and clears config', async () => {
    configReturns({
      modelProviders: [
        { id: 'openai', apiKey: 'sk-real-key', name: 'OpenAI' },
        { id: 'anthropic', apiKey: '', name: 'Anthropic' },
      ],
    });

    await migrateSecretsIfNeeded();

    expect(mockMigrateFromPlaintext).toHaveBeenCalledWith('provider-key:openai', 'sk-real-key');
    // Should clear apiKey in config
    const setCall = mockSetConfigValue.mock.calls.find((c: unknown[]) => c[0] === 'modelProviders');
    expect(setCall).toBeDefined();
    const cleaned = setCall![1] as Array<{ id: string; apiKey: string }>;
    expect(cleaned.find((p) => p.id === 'openai')?.apiKey).toBe('');
    // Untouched provider keeps its empty key
    expect(cleaned.find((p) => p.id === 'anthropic')?.apiKey).toBe('');
  });

  it('migrates web access token', async () => {
    configReturns({ webAccessToken: 'tok-abc123' });

    await migrateSecretsIfNeeded();

    expect(mockMigrateFromPlaintext).toHaveBeenCalledWith('web-access-token', 'tok-abc123');
    expect(mockSetConfigValue).toHaveBeenCalledWith('webAccessToken', '');
  });

  it('migrates web access password', async () => {
    configReturns({ webAccessPassword: 'hunter2' });

    await migrateSecretsIfNeeded();

    expect(mockMigrateFromPlaintext).toHaveBeenCalledWith('web-access-password', 'hunter2');
    expect(mockSetConfigValue).toHaveBeenCalledWith('webAccessPassword', '');
  });

  it('sets migration marker after completion', async () => {
    configReturns({});

    await migrateSecretsIfNeeded();

    expect(mockSetConfigValue).toHaveBeenCalledWith('_secrets_migrated', true);
  });

  it('skips masked apiKey values', async () => {
    configReturns({
      modelProviders: [{ id: 'test', apiKey: '••••••••', name: 'Test' }],
    });

    await migrateSecretsIfNeeded();

    expect(mockMigrateFromPlaintext).not.toHaveBeenCalledWith(
      'provider-key:test',
      expect.anything(),
    );
  });
});
