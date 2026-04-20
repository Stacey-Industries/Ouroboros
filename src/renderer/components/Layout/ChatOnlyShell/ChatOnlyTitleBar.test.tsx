/**
 * @vitest-environment jsdom
 *
 * ChatOnlyTitleBar — smoke tests (Wave 43 Phase C / Wave 44 Phase A).
 *
 * Phase C changes:
 *  - ChatModeBadge removed (was Wave 42).
 *  - "Exit chat mode" button removed (moved to View menu only).
 *  - ChatOnlyHeaderControls mounted inline (mocked here to avoid store dependency).
 *
 * Wave 44 Phase A changes:
 *  - "Exit chat mode" icon button restored to the right of the header controls.
 *    It dispatches TOGGLE_IMMERSIVE_CHAT_EVENT and has no text label (icon only).
 *  - WebkitAppRegion: 'drag' moved off <header> onto a flex-1 spacer div.
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

  it('shows Exit chat mode icon button (restored in Wave 44 Phase A)', () => {
    render(<ChatOnlyTitleBar onToggleDrawer={vi.fn()} />);
    expect(screen.getByTitle('Exit chat mode')).toBeDefined();
  });

  it('dispatches TOGGLE_IMMERSIVE_CHAT_EVENT when Exit button is clicked', () => {
    const dispatched: string[] = [];
    const origDispatch = window.dispatchEvent.bind(window);
    vi.spyOn(window, 'dispatchEvent').mockImplementation((evt: Event) => {
      dispatched.push(evt.type);
      return origDispatch(evt);
    });
    render(<ChatOnlyTitleBar onToggleDrawer={vi.fn()} />);
    fireEvent.click(screen.getByTitle('Exit chat mode'));
    expect(dispatched).toContain('agent-ide:toggle-immersive-chat');
    vi.restoreAllMocks();
  });

  it('Exit chat mode button has no visible text label (icon-only)', () => {
    render(<ChatOnlyTitleBar onToggleDrawer={vi.fn()} />);
    const btn = screen.getByTitle('Exit chat mode');
    expect(btn.textContent?.trim()).toBe('');
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

  it('header element has no WebkitAppRegion drag style (moved to spacer div)', () => {
    render(<ChatOnlyTitleBar onToggleDrawer={vi.fn()} />);
    const header = screen.getByTestId('chat-only-title-bar');
    // The drag region must be on the spacer div, not the header itself.
    expect((header as HTMLElement).style.webkitAppRegion ?? '').not.toBe('drag');
  });
});
