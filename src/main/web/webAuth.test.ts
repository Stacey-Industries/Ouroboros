import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetSecureKeySync = vi.fn();
const mockSetSecureKey = vi.fn();
const mockGetConfigValue = vi.fn();

vi.mock('../auth/secureKeyStore', () => ({
  getSecureKeySync: (...args: unknown[]) => mockGetSecureKeySync(...args),
  setSecureKey: (...args: unknown[]) => mockSetSecureKey(...args),
}));

vi.mock('../config', () => ({
  getConfigValue: (...args: unknown[]) => mockGetConfigValue(...args),
}));

// Import after mocks are declared
const {
  getLoginPageHtml,
  getOrCreateWebToken,
  hasPasswordConfigured,
  isRateLimited,
  recordFailedAttempt,
  validateCredential,
  validatePassword,
  validateToken,
} = await import('./webAuth');

// Helper to clear the module-level failedAttempts map between tests.
// We reach in by running repeated recordFailedAttempt calls that reset on window
// expiry — but the simplest cross-test reset is to advance time past the 15 min
// window so all existing entries become stale, then call isRateLimited to evict them.
function clearRateLimiter(): void {
  vi.advanceTimersByTime(16 * 60 * 1000); // 16 min — past the 15-min window
  isRateLimited('__flush__'); // triggers stale-entry eviction loop
}

describe('getOrCreateWebToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns token from SecureKeyStore when present', () => {
    mockGetSecureKeySync.mockReturnValue('stored-token-from-keystore');
    const token = getOrCreateWebToken();
    expect(token).toBe('stored-token-from-keystore');
    expect(mockGetConfigValue).not.toHaveBeenCalled();
    expect(mockSetSecureKey).not.toHaveBeenCalled();
  });

  it('falls back to config value when SecureKeyStore has no token', () => {
    mockGetSecureKeySync.mockReturnValue(null);
    mockGetConfigValue.mockReturnValue('token-from-config');
    const token = getOrCreateWebToken();
    expect(token).toBe('token-from-config');
    expect(mockSetSecureKey).not.toHaveBeenCalled();
  });

  it('generates a 64-char hex token and persists it when neither store has one', () => {
    mockGetSecureKeySync.mockReturnValue(null);
    mockGetConfigValue.mockReturnValue(undefined);
    const token = getOrCreateWebToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(mockSetSecureKey).toHaveBeenCalledWith('web-access-token', token);
  });
});

describe('validateToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSecureKeySync.mockReturnValue('abc123token');
    mockGetConfigValue.mockReturnValue(undefined);
  });

  it('returns true for the correct token', () => {
    expect(validateToken('abc123token')).toBe(true);
  });

  it('returns false for a wrong token of the same length', () => {
    expect(validateToken('abc123WRONG')).toBe(false);
  });

  it('returns false for a token with different length', () => {
    expect(validateToken('short')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(validateToken('')).toBe(false);
  });
});

describe('hasPasswordConfigured', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when SecureKeyStore has a password', () => {
    mockGetSecureKeySync.mockImplementation((key: string) =>
      key === 'web-access-password' ? 'secret' : null,
    );
    expect(hasPasswordConfigured()).toBe(true);
  });

  it('returns true when config has a password and keystore is empty', () => {
    mockGetSecureKeySync.mockReturnValue(null);
    mockGetConfigValue.mockImplementation((key: string) =>
      key === 'webAccessPassword' ? 'secret' : undefined,
    );
    expect(hasPasswordConfigured()).toBe(true);
  });

  it('returns false when neither store has a password', () => {
    mockGetSecureKeySync.mockReturnValue(null);
    mockGetConfigValue.mockReturnValue(undefined);
    expect(hasPasswordConfigured()).toBe(false);
  });

  it('returns false when password is an empty string', () => {
    mockGetSecureKeySync.mockImplementation((key: string) =>
      key === 'web-access-password' ? '' : null,
    );
    mockGetConfigValue.mockReturnValue('');
    expect(hasPasswordConfigured()).toBe(false);
  });
});

describe('validatePassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true for the correct password', () => {
    mockGetSecureKeySync.mockImplementation((key: string) =>
      key === 'web-access-password' ? 'correct-pass' : null,
    );
    expect(validatePassword('correct-pass')).toBe(true);
  });

  it('returns false for a wrong password', () => {
    mockGetSecureKeySync.mockImplementation((key: string) =>
      key === 'web-access-password' ? 'correct-pass' : null,
    );
    expect(validatePassword('wrong-pass!!!')).toBe(false);
  });

  it('returns false when no password is configured', () => {
    mockGetSecureKeySync.mockReturnValue(null);
    mockGetConfigValue.mockReturnValue(undefined);
    expect(validatePassword('anything')).toBe(false);
  });

  it('returns false for an empty provided value', () => {
    mockGetSecureKeySync.mockImplementation((key: string) =>
      key === 'web-access-password' ? 'secret' : null,
    );
    expect(validatePassword('')).toBe(false);
  });

  it('returns false when provided length differs from stored password', () => {
    mockGetSecureKeySync.mockImplementation((key: string) =>
      key === 'web-access-password' ? 'secret' : null,
    );
    expect(validatePassword('sec')).toBe(false);
  });
});

describe('validateCredential', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates against password when password is configured', () => {
    mockGetSecureKeySync.mockImplementation((key: string) => {
      if (key === 'web-access-password') return 'my-password';
      return null;
    });
    expect(validateCredential('my-password')).toBe(true);
    expect(validateCredential('wrong-token!')).toBe(false);
  });

  it('validates against token when no password is configured', () => {
    mockGetSecureKeySync.mockImplementation((key: string) => {
      if (key === 'web-access-token') return 'my-token-value';
      return null;
    });
    mockGetConfigValue.mockReturnValue(undefined);
    expect(validateCredential('my-token-value')).toBe(true);
    expect(validateCredential('wrong-password!')).toBe(false);
  });
});

describe('isRateLimited / recordFailedAttempt', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockGetSecureKeySync.mockReturnValue(null);
    mockGetConfigValue.mockReturnValue(undefined);
  });

  afterEach(() => {
    clearRateLimiter();
    vi.useRealTimers();
  });

  it('is not rate limited before any failed attempts', () => {
    expect(isRateLimited('1.2.3.4')).toBe(false);
  });

  it('is not rate limited after 9 failed attempts', () => {
    for (let i = 0; i < 9; i++) {
      recordFailedAttempt('1.2.3.5');
    }
    expect(isRateLimited('1.2.3.5')).toBe(false);
  });

  it('is rate limited after 10 failed attempts', () => {
    for (let i = 0; i < 10; i++) {
      recordFailedAttempt('1.2.3.6');
    }
    expect(isRateLimited('1.2.3.6')).toBe(true);
  });

  it('is not rate limited after the 15-minute window expires', () => {
    for (let i = 0; i < 10; i++) {
      recordFailedAttempt('1.2.3.7');
    }
    expect(isRateLimited('1.2.3.7')).toBe(true);

    vi.advanceTimersByTime(15 * 60 * 1000 + 1);
    expect(isRateLimited('1.2.3.7')).toBe(false);
  });

  it('resets the counter for an IP whose window expired on the next attempt', () => {
    for (let i = 0; i < 10; i++) {
      recordFailedAttempt('1.2.3.8');
    }
    vi.advanceTimersByTime(15 * 60 * 1000 + 1);

    // One new attempt should restart the window, not immediately lock out
    recordFailedAttempt('1.2.3.8');
    expect(isRateLimited('1.2.3.8')).toBe(false);
  });

  it('tracks different IPs independently', () => {
    for (let i = 0; i < 10; i++) {
      recordFailedAttempt('10.0.0.1');
    }
    expect(isRateLimited('10.0.0.1')).toBe(true);
    expect(isRateLimited('10.0.0.2')).toBe(false);
  });

  it('evicts stale entries from other IPs when checking a new IP', () => {
    for (let i = 0; i < 10; i++) {
      recordFailedAttempt('192.168.1.1');
    }
    vi.advanceTimersByTime(15 * 60 * 1000 + 1);

    // Checking a fresh IP triggers stale-entry cleanup
    expect(isRateLimited('192.168.1.2')).toBe(false);
    // The stale entry for 192.168.1.1 should now be gone; it won't be locked
    expect(isRateLimited('192.168.1.1')).toBe(false);
  });
});

describe('getLoginPageHtml', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows "Access Token" label when no password is configured', () => {
    mockGetSecureKeySync.mockReturnValue(null);
    mockGetConfigValue.mockReturnValue(undefined);
    const html = getLoginPageHtml();
    expect(html).toContain('Access Token');
    expect(html).not.toContain('>Password<');
  });

  it('shows "Password" label when a password is configured', () => {
    mockGetSecureKeySync.mockImplementation((key: string) =>
      key === 'web-access-password' ? 'secret' : null,
    );
    const html = getLoginPageHtml();
    expect(html).toContain('>Password<');
    expect(html).not.toContain('Access Token');
  });

  it('returns valid HTML with expected structural elements', () => {
    mockGetSecureKeySync.mockReturnValue(null);
    mockGetConfigValue.mockReturnValue(undefined);
    const html = getLoginPageHtml();
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<form id="login-form">');
    expect(html).toContain('id="credential"');
    expect(html).toContain('id="submit-btn"');
  });

  it('includes the help text for the token flow', () => {
    mockGetSecureKeySync.mockReturnValue(null);
    mockGetConfigValue.mockReturnValue(undefined);
    const html = getLoginPageHtml();
    expect(html).toContain('Settings');
  });

  it('includes the help text for the password flow', () => {
    mockGetSecureKeySync.mockImplementation((key: string) =>
      key === 'web-access-password' ? 'secret' : null,
    );
    const html = getLoginPageHtml();
    expect(html).toContain('Web Access Password');
  });
});
