/**
 * FlowActions.test.tsx — smoke tests for the save + Mermaid-export action row.
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FlowTrace } from '../../../shared/types/flowTracer';
import { FlowActions } from './FlowActions';

const STUB_FLOW: FlowTrace = {
  id: 'trace-1',
  title: 'Test',
  entryPoint: { symbol: 'foo', file: 'foo.ts', line: 1 },
  steps: [],
  edges: [],
  generatedAt: 0,
  graphVersion: 'stub',
  metadata: { layerCount: 0, boundaryCount: 0, depthCapHit: false },
};

const mockSaveFlow = vi.fn();
const mockExportMermaid = vi.fn();
const mockListSavedFlows = vi.fn();
const mockClipboardWrite = vi.fn();

beforeEach(() => {
  mockSaveFlow.mockReset().mockResolvedValue({ success: true, id: 'saved-1' });
  mockExportMermaid
    .mockReset()
    .mockResolvedValue({ success: true, mermaid: 'sequenceDiagram\nA->>B: x' });
  mockListSavedFlows.mockReset().mockResolvedValue({ success: true, flows: [] });
  mockClipboardWrite.mockReset().mockResolvedValue(undefined);
  window.electronAPI = {
    flowTracer: {
      saveFlow: mockSaveFlow,
      exportMermaid: mockExportMermaid,
      listSavedFlows: mockListSavedFlows,
    },
  } as unknown as typeof window.electronAPI;
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: mockClipboardWrite },
    writable: true,
    configurable: true,
  });
});

afterEach(cleanup);

describe('FlowActions', () => {
  it('disables Save when title is empty', () => {
    render(<FlowActions flow={STUB_FLOW} />);
    const saveBtn = screen.getByRole('button', { name: /^save$/i }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });

  it('enables Save once a title is typed', () => {
    render(<FlowActions flow={STUB_FLOW} />);
    fireEvent.change(screen.getByPlaceholderText(/save as/i), { target: { value: 'My Flow' } });
    const saveBtn = screen.getByRole('button', { name: /^save$/i }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);
  });

  it('calls saveFlow IPC when Save is clicked with a title', async () => {
    render(<FlowActions flow={STUB_FLOW} />);
    fireEvent.change(screen.getByPlaceholderText(/save as/i), { target: { value: 'My Flow' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(mockSaveFlow).toHaveBeenCalledWith(STUB_FLOW, 'My Flow'));
  });

  it('writes Mermaid output to the clipboard on export click', async () => {
    render(<FlowActions flow={STUB_FLOW} />);
    fireEvent.click(screen.getByRole('button', { name: /copy mermaid/i }));
    await waitFor(() =>
      expect(mockClipboardWrite).toHaveBeenCalledWith('sequenceDiagram\nA->>B: x'),
    );
  });

  it('renders an error message when save fails', async () => {
    mockSaveFlow.mockResolvedValue({ success: false, error: 'disk full' });
    render(<FlowActions flow={STUB_FLOW} />);
    fireEvent.change(screen.getByPlaceholderText(/save as/i), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(screen.getByText(/disk full/i)).toBeTruthy());
  });
});
