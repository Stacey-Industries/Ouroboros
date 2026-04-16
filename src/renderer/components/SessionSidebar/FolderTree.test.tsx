/**
 * FolderTree.test.tsx
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionFolder, SessionRecord } from '../../types/electron';
import { FolderTree } from './FolderTree';

// ─── @dnd-kit stub (PointerSensor requires a real DOM pointer env) ────────────

vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>();
  return {
    ...actual,
    // Replace DndContext with a passthrough so tests don't need pointer events.
    DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    DragOverlay: () => null,
    useSensor: vi.fn(() => ({})),
    useSensors: vi.fn((...sensors: unknown[]) => sensors),
    PointerSensor: vi.fn(),
    closestCenter: vi.fn(),
  };
});

// ─── electronAPI mock ─────────────────────────────────────────────────────────

const mockFolderCrud = {
  moveSession: vi.fn().mockResolvedValue({ success: true }),
  rename: vi.fn().mockResolvedValue({ success: true }),
  delete: vi.fn().mockResolvedValue({ success: true }),
};

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: { folderCrud: mockFolderCrud },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSession(id: string, projectRoot = '/projects/app'): SessionRecord {
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

function makeFolder(id: string, name: string, sessionIds: string[] = []): SessionFolder {
  return { id, name, sessionIds, createdAt: 1000, order: 0 };
}

const defaultProps = {
  activeSessionId: null as string | null,
  onSessionClick: vi.fn(),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FolderTree', () => {
  it('renders the Uncategorized bucket header', () => {
    render(
      <FolderTree folders={[]} sessions={[]} {...defaultProps} />,
    );
    expect(screen.getByText(/uncategorized/i)).toBeTruthy();
  });

  it('renders a user folder header by name', () => {
    const folder = makeFolder('f1', 'Sprint 1');
    render(
      <FolderTree folders={[folder]} sessions={[]} {...defaultProps} />,
    );
    expect(screen.getByText('Sprint 1')).toBeTruthy();
  });

  it('shows sessions not in any folder under Uncategorized', () => {
    const sessions = [makeSession('s1', '/projects/alpha')];
    render(
      <FolderTree folders={[]} sessions={sessions} {...defaultProps} />,
    );
    expect(screen.getByText('alpha')).toBeTruthy();
  });

  it('shows sessions assigned to a folder under that folder', () => {
    const session = makeSession('s1', '/projects/beta');
    const folder = makeFolder('f1', 'My Folder', ['s1']);
    render(
      <FolderTree folders={[folder]} sessions={[session]} {...defaultProps} />,
    );
    // 'beta' should appear inside folder, not uncategorized
    expect(screen.getByText('beta')).toBeTruthy();
    expect(screen.getByText('My Folder')).toBeTruthy();
  });

  it('does NOT list a categorized session in Uncategorized', () => {
    const session = makeSession('s1', '/projects/gamma');
    const folder = makeFolder('f1', 'Gamma Folder', ['s1']);
    render(
      <FolderTree folders={[folder]} sessions={[session]} {...defaultProps} />,
    );
    // 'gamma' appears once (inside folder), not twice
    expect(screen.getAllByText('gamma')).toHaveLength(1);
  });

  it('shows empty-folder placeholder when folder has no sessions', () => {
    const folder = makeFolder('f1', 'Empty');
    render(
      <FolderTree folders={[folder]} sessions={[]} {...defaultProps} />,
    );
    // Both the folder and Uncategorized are empty — at least one placeholder shown.
    expect(screen.getAllByText(/no sessions yet/i).length).toBeGreaterThanOrEqual(1);
  });

  it('shows empty-bucket placeholder when uncategorized has no sessions', () => {
    render(
      <FolderTree folders={[]} sessions={[]} {...defaultProps} />,
    );
    expect(screen.getByText(/no sessions yet/i)).toBeTruthy();
  });

  it('renders rename button for user folders', () => {
    const folder = makeFolder('f1', 'Renameable');
    render(
      <FolderTree folders={[folder]} sessions={[]} {...defaultProps} />,
    );
    expect(screen.getByLabelText(/rename folder renameable/i)).toBeTruthy();
  });

  it('renders delete button for user folders', () => {
    const folder = makeFolder('f1', 'Deleteable');
    render(
      <FolderTree folders={[folder]} sessions={[]} {...defaultProps} />,
    );
    expect(screen.getByLabelText(/delete folder deleteable/i)).toBeTruthy();
  });

  it('does NOT render rename/delete buttons on Uncategorized', () => {
    render(
      <FolderTree folders={[]} sessions={[]} {...defaultProps} />,
    );
    expect(screen.queryByLabelText(/rename folder uncategorized/i)).toBeNull();
    expect(screen.queryByLabelText(/delete folder uncategorized/i)).toBeNull();
  });

  it('calls onSessionClick when a session row is clicked', async () => {
    const onClick = vi.fn();
    const session = makeSession('s-click', '/projects/click-me');
    render(
      <FolderTree folders={[]} sessions={[session]} activeSessionId={null} onSessionClick={onClick} />,
    );
    const rows = screen.getAllByRole('row');
    rows[0]?.click();
    expect(onClick).toHaveBeenCalledWith('s-click');
  });

  it('renders multiple folders sorted by order', () => {
    const f1 = makeFolder('f1', 'Bravo');
    const f2 = { ...makeFolder('f2', 'Alpha'), order: -1 };
    render(
      <FolderTree folders={[f1, f2]} sessions={[]} {...defaultProps} />,
    );
    const headers = screen.getAllByRole('button', { name: /▾|▸/ });
    // Alpha (order -1) should come before Bravo (order 0)
    const texts = headers.map((h) => h.textContent ?? '');
    const alphaIdx = texts.findIndex((t) => t.includes('Alpha'));
    const bravoIdx = texts.findIndex((t) => t.includes('Bravo'));
    expect(alphaIdx).toBeLessThan(bravoIdx);
  });
});
