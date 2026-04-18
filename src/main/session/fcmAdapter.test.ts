/**
 * fcmAdapter.test.ts — tests for the FCM adapter stub.
 *
 * The adapter is currently a documented stub (no google-auth-library dep).
 * Tests verify the stub contract and that the raw token is never logged.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock logger ──────────────────────────────────────────────────────────────

const logMock = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));

vi.mock('../logger', () => ({ default: logMock }));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { sendFcmNotification } from './fcmAdapter';

// ─── Tests ────────────────────────────────────────────────────────────────────

afterEach(() => { vi.clearAllMocks(); });

describe('sendFcmNotification — stub behaviour', () => {
  it('returns sent:false with reason no-fcm-backend', async () => {
    const result = await sendFcmNotification(
      '/path/to/service-account.json',
      'device-token-xyz',
      { title: 'Job done', body: 'Your dispatch job completed.' },
    );
    expect(result.sent).toBe(false);
    expect(result.reason).toBe('no-fcm-backend');
    expect(result.error).toBeUndefined();
  });

  it('never logs the raw token value', async () => {
    const rawToken = 'super-secret-device-token-12345';
    await sendFcmNotification('/sa.json', rawToken, { title: 'T', body: 'B' });

    const allLogArgs = logMock.info.mock.calls.flat().join(' ');
    expect(allLogArgs).not.toContain(rawToken);
    // Should log a truncated prefix instead
    expect(allLogArgs).toContain(rawToken.slice(0, 8));
  });

  it('does not throw when optional data map is omitted', async () => {
    await expect(
      sendFcmNotification('/sa.json', 'tok', { title: 'T', body: 'B' }),
    ).resolves.not.toThrow();
  });

  it('accepts a data map without throwing', async () => {
    const result = await sendFcmNotification('/sa.json', 'tok', {
      title: 'Done',
      body: 'Job #42 completed',
      data: { jobId: '42', status: 'completed' },
    });
    expect(result.sent).toBe(false);
  });
});

describe('sendFcmNotification — future wiring guard', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('resolves (does not reject) regardless of serviceAccountPath', async () => {
    await expect(
      sendFcmNotification('nonexistent.json', 'tok', { title: 'X', body: 'Y' }),
    ).resolves.toMatchObject({ sent: false });
  });
});
