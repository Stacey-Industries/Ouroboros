/**
 * @vitest-environment jsdom
 *
 * OrchestrationInspector.test.tsx — Render smoke tests.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OrchestrationInspector } from './OrchestrationInspector';

vi.mock('./InspectorTrafficTab', () => ({
  InspectorTrafficTab: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="traffic-tab">traffic:{sessionId}</div>
  ),
}));

vi.mock('./InspectorTimelineTab', () => ({
  InspectorTimelineTab: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="timeline-tab">timeline:{sessionId}</div>
  ),
}));

vi.mock('./InspectorDecisionTab', () => ({
  InspectorDecisionTab: () => <div data-testid="decision-tab">decisions</div>,
}));

vi.mock('./InspectorExport', () => ({
  exportTraceAsHar: vi.fn().mockResolvedValue({ filePath: '/tmp/trace.json' }),
}));

vi.mock('../../contexts/AgentEventsContext', () => ({
  useAgentEventsContext: () => ({
    currentSessions: [{ id: 'ctx-session-1' }],
    agents: [],
    activeCount: 0,
    clearCompleted: vi.fn(),
    dismiss: vi.fn(),
    updateNotes: vi.fn(),
    historicalSessions: [],
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('OrchestrationInspector', () => {
  it('renders the default Traffic tab', () => {
    render(<OrchestrationInspector sessionId="s1" />);
    expect(screen.getByTestId('traffic-tab')).toBeTruthy();
  });

  it('passes sessionId to child tabs', () => {
    render(<OrchestrationInspector sessionId="explicit-session" />);
    expect(screen.getByTestId('traffic-tab').textContent).toContain('explicit-session');
  });
});
