/**
 * @vitest-environment jsdom
 *
 * ChatOnlyTitleBar — smoke tests.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatOnlyTitleBar } from './ChatOnlyTitleBar';

vi.mock('../../../contexts/ProjectContext', () => ({
  useProject: () => ({ projectRoot: '/test/project', projectName: 'project', projectRoots: ['/test/project'] }),
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

  it('shows Chat Mode badge', () => {
    render(<ChatOnlyTitleBar onToggleDrawer={vi.fn()} />);
    expect(screen.getByText('Chat Mode')).toBeDefined();
  });

  it('dispatches toggle-immersive-chat event on exit button click', () => {
    const dispatched: string[] = [];
    const original = window.dispatchEvent.bind(window);
    vi.spyOn(window, 'dispatchEvent').mockImplementation((e) => {
      dispatched.push((e as CustomEvent).type);
      return original(e);
    });

    render(<ChatOnlyTitleBar onToggleDrawer={vi.fn()} />);
    fireEvent.click(screen.getByTitle('Exit chat mode (Ctrl+Shift+I)'));
    expect(dispatched).toContain('agent-ide:toggle-immersive-chat');

    vi.restoreAllMocks();
  });
});
