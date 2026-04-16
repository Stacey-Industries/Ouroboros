/**
 * McpChatToggles.test.tsx — Unit tests for McpChatToggles (Wave 26 Phase D).
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Profile } from '../../types/electron';
import { McpChatToggles } from './McpChatToggles';

// ─── Mock electronAPI ─────────────────────────────────────────────────────────

const mockGetServers = vi.fn();
const mockSetMcpOverrides = vi.fn().mockResolvedValue({ success: true });

function stubElectronApi(serverNames: string[]): void {
  // Assign directly to avoid replacing the window object (which breaks waitFor).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).electronAPI = {
    mcp: {
      getServers: mockGetServers.mockResolvedValue({
        success: true,
        servers: serverNames.map((name) => ({ name })),
      }),
    },
    sessionCrud: {
      setMcpOverrides: mockSetMcpOverrides,
    },
  };
}

beforeEach(() => {
  mockSetMcpOverrides.mockClear();
  mockGetServers.mockClear();
});

afterEach(() => {
  cleanup();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).electronAPI;
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeProfile(mcpServers?: string[]): Profile {
  return { id: 'p1', name: 'Test', createdAt: 0, updatedAt: 0, mcpServers };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('McpChatToggles — empty state', () => {
  it('shows empty message when no servers are configured', async () => {
    stubElectronApi([]);
    render(<McpChatToggles sessionId="s1" onChange={() => undefined} />);
    await waitFor(() =>
      expect(screen.getByText(/No MCP servers/i)).toBeTruthy(),
    );
  });
});

describe('McpChatToggles — server list rendered', () => {
  it('renders a checkbox for each server', async () => {
    stubElectronApi(['context7', 'filesystem', 'github']);
    render(<McpChatToggles sessionId="s1" onChange={() => undefined} />);
    await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(3));
    expect(screen.getByText('context7')).toBeTruthy();
    expect(screen.getByText('filesystem')).toBeTruthy();
    expect(screen.getByText('github')).toBeTruthy();
  });
});

describe('McpChatToggles — initial state', () => {
  it('checks only overridden servers when mcpServerOverrides is provided', async () => {
    stubElectronApi(['context7', 'filesystem', 'github']);
    render(
      <McpChatToggles
        sessionId="s1"
        mcpServerOverrides={['context7']}
        onChange={() => undefined}
      />,
    );
    await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(3));
    const c7cb = screen.getByText('context7').closest('label')
      ?.querySelector('input') as HTMLInputElement;
    const fsCb = screen.getByText('filesystem').closest('label')
      ?.querySelector('input') as HTMLInputElement;
    expect(c7cb?.checked).toBe(true);
    expect(fsCb?.checked).toBe(false);
  });

  it('uses profile mcpServers when no session overrides present', async () => {
    stubElectronApi(['context7', 'filesystem']);
    const profile = makeProfile(['filesystem']);
    render(
      <McpChatToggles sessionId="s1" profile={profile} onChange={() => undefined} />,
    );
    await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(2));
    const fsCb = screen.getByText('filesystem').closest('label')
      ?.querySelector('input') as HTMLInputElement;
    const c7cb = screen.getByText('context7').closest('label')
      ?.querySelector('input') as HTMLInputElement;
    expect(fsCb?.checked).toBe(true);
    expect(c7cb?.checked).toBe(false);
  });

  it('enables all servers when neither overrides nor profile.mcpServers is set', async () => {
    stubElectronApi(['context7', 'filesystem']);
    render(<McpChatToggles sessionId="s1" onChange={() => undefined} />);
    await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(2));
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(checkboxes.every((c) => c.checked)).toBe(true);
  });
});

describe('McpChatToggles — toggle behaviour', () => {
  it('calls setMcpOverrides and onChange when a server is toggled off', async () => {
    stubElectronApi(['context7', 'filesystem']);
    const onChange = vi.fn();
    render(
      <McpChatToggles
        sessionId="s1"
        mcpServerOverrides={['context7', 'filesystem']}
        onChange={onChange}
      />,
    );
    await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(2));
    const c7cb = screen.getByText('context7').closest('label')
      ?.querySelector('input') as HTMLInputElement;
    fireEvent.click(c7cb);
    expect(onChange).toHaveBeenCalledWith(['filesystem']);
    expect(mockSetMcpOverrides).toHaveBeenCalledWith('s1', ['filesystem']);
  });

  it('adds a server when toggled on', async () => {
    stubElectronApi(['context7', 'filesystem']);
    const onChange = vi.fn();
    render(
      <McpChatToggles
        sessionId="s1"
        mcpServerOverrides={['context7']}
        onChange={onChange}
      />,
    );
    await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(2));
    const fsCb = screen.getByText('filesystem').closest('label')
      ?.querySelector('input') as HTMLInputElement;
    fireEvent.click(fsCb);
    expect(onChange).toHaveBeenCalledWith(
      expect.arrayContaining(['context7', 'filesystem']),
    );
    expect(mockSetMcpOverrides).toHaveBeenCalledWith(
      's1',
      expect.arrayContaining(['context7', 'filesystem']),
    );
  });

  it('uses the correct sessionId when calling setMcpOverrides', async () => {
    stubElectronApi(['github']);
    render(
      <McpChatToggles
        sessionId="session-xyz"
        mcpServerOverrides={['github']}
        onChange={() => undefined}
      />,
    );
    await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(1));
    const cb = screen.getByText('github').closest('label')
      ?.querySelector('input') as HTMLInputElement;
    fireEvent.click(cb);
    expect(mockSetMcpOverrides).toHaveBeenCalledWith('session-xyz', []);
  });
});
