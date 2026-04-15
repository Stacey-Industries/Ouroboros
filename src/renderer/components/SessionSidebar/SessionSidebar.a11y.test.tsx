/**
 * SessionSidebar.a11y.test.tsx — axe-core accessibility smoke tests.
 * @vitest-environment jsdom
 */

import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { axe } from '../../../test-utils/axe';
import type { SessionRecord } from '../../types/electron';
import { SessionSidebar } from './SessionSidebar';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSession(id: string, projectRoot = '/projects/alpha'): SessionRecord {
  return {
    id,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastUsedAt: new Date().toISOString(),
    projectRoot,
    worktree: false,
    tags: [],
    activeTerminalIds: [],
    costRollup: { totalUsd: 0, inputTokens: 0, outputTokens: 0 },
    telemetry: { correlationIds: [], telemetrySessionId: id },
  };
}

// ─── electronAPI mock ─────────────────────────────────────────────────────────

const mockApi = {
  sessionCrud: {
    list: vi.fn().mockResolvedValue({ success: true, sessions: [] }),
    active: vi.fn().mockResolvedValue({ success: true, sessionId: null }),
    onChanged: vi.fn(() => vi.fn()),
    create: vi.fn().mockResolvedValue({ success: true }),
  },
  files: {
    selectFolder: vi.fn().mockResolvedValue({ success: true, path: '/projects/new' }),
  },
  config: {
    getAll: vi.fn().mockResolvedValue({ layout: { chatPrimary: true } }),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'electronAPI', {
    value: mockApi,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SessionSidebar — a11y', () => {
  it('has no axe violations when empty', async () => {
    const { container } = render(<SessionSidebar />);
    await waitFor(() => expect(mockApi.config.getAll).toHaveBeenCalled());
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has no axe violations with session rows', async () => {
    mockApi.sessionCrud.list.mockResolvedValue({
      success: true,
      sessions: [
        makeSession('s1', '/projects/alpha'),
        makeSession('s2', '/projects/beta'),
      ],
    });
    const { container } = render(<SessionSidebar />);
    await waitFor(() => expect(mockApi.sessionCrud.list).toHaveBeenCalled());
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
