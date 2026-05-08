/**
 * FlowTracerView.test.tsx — smoke tests for the Flow Tracer walking skeleton.
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STUB_FLOW = {
  title: 'When I send a chat message',
  entryPoint: {
    symbol: 'registerMessageHandlers',
    file: 'src/main/ipc-handlers/agentChat.ts',
    line: 163,
  },
  estimatedSteps: 6,
  layers: ['renderer', 'preload', 'main', 'cli'] as const,
};

const STUB_TRACE = {
  id: 'trace-1',
  title: 'When I send a chat message',
  entryPoint: STUB_FLOW.entryPoint,
  steps: [
    {
      id: 's1',
      layer: 'renderer' as const,
      symbol: 'handleSubmit',
      file: 'src/renderer/components/AgentChat/ChatComposer.tsx',
      line: 1,
      kind: 'function' as const,
      narration: null,
    },
    {
      id: 's2',
      layer: 'main' as const,
      symbol: 'registerMessageHandlers',
      file: 'src/main/ipc-handlers/agentChat.ts',
      line: 163,
      kind: 'ipc-handler' as const,
      narration: null,
    },
  ],
  edges: [
    { from: 's1', to: 's2', kind: 'boundary' as const, boundaryChannel: 'agentChat:sendMessage' },
  ],
  generatedAt: 0,
  graphVersion: 'stub',
  metadata: { layerCount: 2, boundaryCount: 1, depthCapHit: false },
};

const mockListFlows = vi.fn();
const mockRunTrace = vi.fn();
const mockGetNarration = vi.fn();
const mockGetFlowWhy = vi.fn();
const mockListSavedFlows = vi.fn();
const mockLoadFlow = vi.fn();
const mockSaveFlow = vi.fn();
const mockExportMermaid = vi.fn();

beforeEach(() => {
  mockListFlows.mockReset();
  mockRunTrace.mockReset();
  mockGetNarration.mockReset().mockResolvedValue({ success: true, narration: null });
  mockGetFlowWhy.mockReset().mockResolvedValue({ success: true, entries: [] });
  mockListSavedFlows.mockReset().mockResolvedValue({ success: true, flows: [] });
  mockLoadFlow.mockReset().mockResolvedValue({ success: true, flow: STUB_TRACE });
  mockSaveFlow.mockReset().mockResolvedValue({ success: true, id: 'saved-1' });
  mockExportMermaid.mockReset().mockResolvedValue({ success: true, mermaid: '' });
  window.electronAPI = {
    flowTracer: {
      listFlows: mockListFlows,
      runTrace: mockRunTrace,
      getNarration: mockGetNarration,
      getFlowWhy: mockGetFlowWhy,
      listSavedFlows: mockListSavedFlows,
      loadFlow: mockLoadFlow,
      saveFlow: mockSaveFlow,
      exportMermaid: mockExportMermaid,
    },
  } as unknown as typeof window.electronAPI;
});

afterEach(cleanup);

import { FlowTracerView } from './FlowTracerView';

describe('FlowTracerView', () => {
  it('shows loading state initially', () => {
    mockListFlows.mockReturnValue(new Promise(() => {}));
    render(<FlowTracerView />);
    expect(screen.getByText(/loading flows/i)).toBeTruthy();
  });

  it('renders a flow tile after load', async () => {
    mockListFlows.mockResolvedValue([STUB_FLOW]);
    render(<FlowTracerView />);
    await waitFor(() => {
      expect(screen.getByText('When I send a chat message')).toBeTruthy();
    });
  });

  it('shows error when listFlows rejects', async () => {
    mockListFlows.mockRejectedValue(new Error('network error'));
    render(<FlowTracerView />);
    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeTruthy();
    });
  });

  it('triggers a trace when a tile is clicked', async () => {
    mockListFlows.mockResolvedValue([STUB_FLOW]);
    mockRunTrace.mockReturnValue(new Promise(() => {}));
    render(<FlowTracerView />);
    await waitFor(() => screen.getByText('When I send a chat message'));
    fireEvent.click(screen.getByRole('button', { name: /when i send a chat message/i }));
    expect(mockRunTrace).toHaveBeenCalledWith(STUB_FLOW.entryPoint);
  });

  it('renders the step list after a successful trace', async () => {
    mockListFlows.mockResolvedValue([STUB_FLOW]);
    mockRunTrace.mockResolvedValue(STUB_TRACE);
    render(<FlowTracerView />);
    await waitFor(() => screen.getByRole('button', { name: /when i send a chat message/i }));
    fireEvent.click(screen.getByRole('button', { name: /when i send a chat message/i }));
    await waitFor(() => {
      expect(screen.getByText('handleSubmit')).toBeTruthy();
    });
  });
});
