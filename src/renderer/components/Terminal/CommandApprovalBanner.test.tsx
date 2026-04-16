/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApprovalRequest } from '../../types/electron';
import { CommandApprovalBanner } from './CommandApprovalBanner';

// ─── Mock window.electronAPI ─────────────────────────────────────────────────

const mockRespond = vi.fn().mockResolvedValue({ success: true });
const mockRemember = vi.fn().mockResolvedValue({ success: true });

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'electronAPI', {
    value: {
      approval: {
        respond: mockRespond,
        remember: mockRemember,
        onRequest: vi.fn(() => () => {}),
        onResolved: vi.fn(() => () => {}),
      },
    },
    writable: true,
    configurable: true,
  });
});

afterEach(() => cleanup());

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeRequest(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    requestId: 'req-123',
    toolName: 'Bash',
    toolInput: { command: 'npm test' },
    sessionId: 'session-abc',
    timestamp: Date.now(),
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CommandApprovalBanner', () => {
  it('renders the tool name', () => {
    render(<CommandApprovalBanner request={makeRequest()} onDecision={vi.fn()} />);
    expect(screen.getByText('Bash')).toBeDefined();
  });

  it('renders the command preview', () => {
    render(<CommandApprovalBanner request={makeRequest()} onDecision={vi.fn()} />);
    expect(screen.getByText('npm test')).toBeDefined();
  });

  it('renders four action buttons', () => {
    render(<CommandApprovalBanner request={makeRequest()} onDecision={vi.fn()} />);
    expect(screen.getByText('Allow Once')).toBeDefined();
    expect(screen.getByText('Allow Always')).toBeDefined();
    expect(screen.getByText('Deny Once')).toBeDefined();
    expect(screen.getByText('Deny Always')).toBeDefined();
  });

  it('has an alertdialog role for accessibility', () => {
    render(<CommandApprovalBanner request={makeRequest()} onDecision={vi.fn()} />);
    expect(screen.getByRole('alertdialog')).toBeDefined();
  });

  it('Allow Once — calls respond(approve) without remember', async () => {
    const onDecision = vi.fn();
    render(<CommandApprovalBanner request={makeRequest()} onDecision={onDecision} />);
    fireEvent.click(screen.getByText('Allow Once'));
    await waitFor(() => expect(mockRespond).toHaveBeenCalledOnce());
    expect(mockRespond).toHaveBeenCalledWith('req-123', 'approve');
    expect(mockRemember).not.toHaveBeenCalled();
    expect(onDecision).toHaveBeenCalledWith('req-123');
  });

  it('Deny Once — calls respond(reject) without remember', async () => {
    const onDecision = vi.fn();
    render(<CommandApprovalBanner request={makeRequest()} onDecision={onDecision} />);
    fireEvent.click(screen.getByText('Deny Once'));
    await waitFor(() => expect(mockRespond).toHaveBeenCalledOnce());
    expect(mockRespond).toHaveBeenCalledWith('req-123', 'reject');
    expect(mockRemember).not.toHaveBeenCalled();
    expect(onDecision).toHaveBeenCalledWith('req-123');
  });

  it('Allow Always — calls remember(allow) then respond(approve)', async () => {
    const onDecision = vi.fn();
    render(<CommandApprovalBanner request={makeRequest()} onDecision={onDecision} />);
    fireEvent.click(screen.getByText('Allow Always'));
    await waitFor(() => expect(mockRemember).toHaveBeenCalledOnce());
    expect(mockRemember).toHaveBeenCalledWith('Bash', 'npm test', 'allow');
    expect(mockRespond).toHaveBeenCalledWith('req-123', 'approve');
    expect(onDecision).toHaveBeenCalledWith('req-123');
  });

  it('Deny Always — calls remember(deny) then respond(reject)', async () => {
    const onDecision = vi.fn();
    render(<CommandApprovalBanner request={makeRequest()} onDecision={onDecision} />);
    fireEvent.click(screen.getByText('Deny Always'));
    await waitFor(() => expect(mockRemember).toHaveBeenCalledOnce());
    expect(mockRemember).toHaveBeenCalledWith('Bash', 'npm test', 'deny');
    expect(mockRespond).toHaveBeenCalledWith('req-123', 'reject');
    expect(onDecision).toHaveBeenCalledWith('req-123');
  });

  it('buttons are disabled while a decision is in flight', async () => {
    // Make respond hang so we can inspect the interim disabled state
    let resolveRespond!: () => void;
    mockRespond.mockReturnValue(
      new Promise<{ success: boolean }>((res) => {
        resolveRespond = () => res({ success: true });
      }),
    );

    render(<CommandApprovalBanner request={makeRequest()} onDecision={vi.fn()} />);
    fireEvent.click(screen.getByText('Allow Once'));

    // All buttons should be disabled mid-flight
    await waitFor(() => {
      const buttons = screen.getAllByRole('button');
      expect(buttons.every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    });

    resolveRespond();
  });

  it('uses file_path as key for Write tool', async () => {
    const req = makeRequest({
      toolName: 'Write',
      toolInput: { file_path: '/src/foo.ts', content: 'hello' },
    });
    render(<CommandApprovalBanner request={req} onDecision={vi.fn()} />);
    fireEvent.click(screen.getByText('Allow Always'));
    await waitFor(() => expect(mockRemember).toHaveBeenCalledOnce());
    expect(mockRemember).toHaveBeenCalledWith('Write', '/src/foo.ts', 'allow');
  });

  it('truncates long commands in preview', () => {
    const longCmd = 'x'.repeat(150);
    const req = makeRequest({ toolInput: { command: longCmd } });
    render(<CommandApprovalBanner request={req} onDecision={vi.fn()} />);
    // Preview should be capped at 120 chars + ellipsis
    const previewEl = screen.getByTestId('command-approval-banner').querySelector('pre');
    expect(previewEl?.textContent?.length).toBeLessThanOrEqual(122); // 120 + "…"
  });
});
