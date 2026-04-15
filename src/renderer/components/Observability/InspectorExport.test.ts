/**
 * InspectorExport.test.ts — Unit tests for the HAR/JSON export action.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { exportTraceAsHar } from './InspectorExport';

// ─── Mock window.electronAPI ──────────────────────────────────────────────────

const mockExportTrace = vi.fn();

beforeEach(() => {
  vi.stubGlobal('window', {
    electronAPI: {
      observability: {
        exportTrace: mockExportTrace,
      },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('exportTraceAsHar', () => {
  it('calls exportTrace with sessionId and default json format', async () => {
    mockExportTrace.mockResolvedValue({ success: true, filePath: '/downloads/trace.json' });
    const result = await exportTraceAsHar('session-123');
    expect(mockExportTrace).toHaveBeenCalledWith({ sessionId: 'session-123', format: 'json' });
    expect(result).toEqual({ filePath: '/downloads/trace.json' });
  });

  it('passes har format when specified', async () => {
    mockExportTrace.mockResolvedValue({ success: true, filePath: '/downloads/trace.har' });
    const result = await exportTraceAsHar('session-abc', 'har');
    expect(mockExportTrace).toHaveBeenCalledWith({ sessionId: 'session-abc', format: 'har' });
    expect(result).toEqual({ filePath: '/downloads/trace.har' });
  });

  it('returns null when sessionId is empty', async () => {
    const result = await exportTraceAsHar('');
    expect(mockExportTrace).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('returns null when IPC returns success: false', async () => {
    mockExportTrace.mockResolvedValue({ success: false, error: 'store unavailable' });
    const result = await exportTraceAsHar('session-fail');
    expect(result).toBeNull();
  });

  it('returns null when filePath is missing in successful response', async () => {
    mockExportTrace.mockResolvedValue({ success: true });
    const result = await exportTraceAsHar('session-nopath');
    expect(result).toBeNull();
  });
});
