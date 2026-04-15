/**
 * @vitest-environment jsdom
 *
 * InspectorTimelineTab.test.tsx — Render smoke tests.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InspectorTimelineTab } from './InspectorTimelineTab';

const mockQueryEvents = vi.fn();

beforeEach(() => {
  (window as unknown as { electronAPI: unknown }).electronAPI = {
    telemetry: { queryEvents: mockQueryEvents },
  };
});

afterEach(() => {
  delete (window as unknown as { electronAPI?: unknown }).electronAPI;
  vi.clearAllMocks();
});

describe('InspectorTimelineTab', () => {
  it('shows empty state when no events returned', async () => {
    mockQueryEvents.mockResolvedValue({ success: true, events: [] });
    render(<InspectorTimelineTab sessionId="s1" />);
    await waitFor(() => {
      expect(screen.getByText(/No events yet/i)).toBeTruthy();
    });
  });

  it('calls queryEvents with sessionId and limit 100', async () => {
    mockQueryEvents.mockResolvedValue({ success: true, events: [] });
    render(<InspectorTimelineTab sessionId="trace-123" />);
    await waitFor(() => {
      expect(mockQueryEvents).toHaveBeenCalledWith({ sessionId: 'trace-123', limit: 100 });
    });
  });
});
