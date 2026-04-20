/**
 * @vitest-environment jsdom
 *
 * ChatOnlyTitleBar — smoke tests (Wave 43 Phase C).
 *
 * Phase C changes:
 *  - ChatModeBadge removed (was Wave 42).
 *  - "Exit chat mode" button removed (moved to View menu only).
 *  - ChatOnlyHeaderControls mounted inline (mocked here to avoid store dependency).
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatOnlyTitleBar } from './ChatOnlyTitleBar';

vi.mock('../../../contexts/ProjectContext', () => ({
  useProject: () => ({ projectRoot: '/test/project', projectName: 'project', projectRoots: ['/test/project'] }),
}));

vi.mock('./ChatOnlyHeaderControls', () => ({
  ChatOnlyHeaderControls: () => <div data-testid="header-controls-stub" />,
}));

afterEach(() => cleanup());

describe('ChatOnlyTitleBar', () => {
  it('renders without throwing', () => {
    const { container } = render(<ChatOnlyTitleBar onToggleDrawer={vi.fn()} />);
    expect(container).toBeDefined();
  });

  it('calls onToggleDrawer when drawer button is clicked', () => {
    const onToggleDrawer = vi.fn();
    render(<ChatOnlyTitleBar onToggleDrawer={onToggleDrawer} />);
    fireEvent.click(screen.getByTitle('Toggle session drawer'));
    expect(onToggleDrawer).toHaveBeenCalledOnce();
  });

  it('shows project name', () => {
    render(<ChatOnlyTitleBar onToggleDrawer={vi.fn()} />);
    expect(screen.getByText('project')).toBeDefined();
  });

  it('does NOT show Chat Mode badge (removed in Wave 43 Phase C)', () => {
    render(<ChatOnlyTitleBar onToggleDrawer={vi.fn()} />);
    expect(screen.queryByText('Chat Mode')).toBeNull();
  });

  it('does NOT show Exit chat mode button (moved to View menu in Wave 43 Phase C)', () => {
    render(<ChatOnlyTitleBar onToggleDrawer={vi.fn()} />);
    expect(screen.queryByTitle('Exit chat mode (Ctrl+Alt+I)')).toBeNull();
  });

  it('mounts ChatOnlyHeaderControls inline', () => {
    render(<ChatOnlyTitleBar onToggleDrawer={vi.fn()} />);
    expect(screen.getByTestId('header-controls-stub')).toBeDefined();
  });

  it('has no border-b class on the header element', () => {
    render(<ChatOnlyTitleBar onToggleDrawer={vi.fn()} />);
    const header = screen.getByTestId('chat-only-title-bar');
    expect(header.className).not.toContain('border-b');
  });
});
