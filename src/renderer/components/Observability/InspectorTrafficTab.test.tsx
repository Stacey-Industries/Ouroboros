/**
 * @vitest-environment jsdom
 *
 * InspectorTrafficTab.test.tsx — Render smoke tests.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InspectorTrafficTab } from './InspectorTrafficTab';

const mockQueryTraces = vi.fn();

beforeEach(() => {
  (window as unknown as { electronAPI: unknown }).electronAPI = {
    telemetry: { queryTraces: mockQueryTraces },
  };
});

afterEach(() => {
  delete (window as unknown as { electronAPI?: unknown }).electronAPI;
  vi.clearAllMocks();
});

describe('InspectorTrafficTab', () => {
  it('shows empty state when no traces returned', async () => {
    mockQueryTraces.mockResolvedValue({ success: true, traces: [] });
    render(<InspectorTrafficTab sessionId="s1" />);
    await waitFor(() => {
      expect(screen.getByText(/No orchestration traces/i)).toBeTruthy();
    });
  });

  it('calls queryTraces with sessionId and limit 200', async () => {
    mockQueryTraces.mockResolvedValue({ success: true, traces: [] });
    render(<InspectorTrafficTab sessionId="trace-456" />);
    await waitFor(() => {
      expect(mockQueryTraces).toHaveBeenCalledWith({ sessionId: 'trace-456', limit: 200 });
    });
  });
});
