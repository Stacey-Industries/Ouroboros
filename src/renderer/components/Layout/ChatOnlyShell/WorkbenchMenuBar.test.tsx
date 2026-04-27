/**
 * @vitest-environment jsdom
 *
 * WorkbenchMenuBar — smoke + interaction tests (Wave 59 Phase C).
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkbenchMenuBar } from './WorkbenchMenuBar';

afterEach(() => cleanup());

describe('WorkbenchMenuBar', () => {
  it('renders without throwing', () => {
    const { container } = render(<WorkbenchMenuBar />);
    expect(container).toBeDefined();
  });

  it('renders all five menu buttons: File, Edit, View, Tools, Help', () => {
    render(<WorkbenchMenuBar />);
    for (const label of ['File', 'Edit', 'View', 'Tools', 'Help']) {
      expect(screen.getByText(label)).toBeDefined();
    }
  });

  it('does NOT render a Terminal menu button', () => {
    render(<WorkbenchMenuBar />);
    expect(screen.queryByText('Terminal')).toBeNull();
  });

  it('has data-testid="workbench-menu-bar"', () => {
    render(<WorkbenchMenuBar />);
    expect(screen.getByTestId('workbench-menu-bar')).toBeDefined();
  });

  describe('click interaction', () => {
    it('clicking File opens its dropdown', () => {
      render(<WorkbenchMenuBar />);
      fireEvent.click(screen.getByText('File'));
      expect(screen.getByText('New Session')).toBeDefined();
    });

    it('clicking File twice closes the dropdown', () => {
      render(<WorkbenchMenuBar />);
      fireEvent.click(screen.getByText('File'));
      fireEvent.click(screen.getByText('File'));
      expect(screen.queryByText('New Session')).toBeNull();
    });

    it('clicking Edit opens its dropdown with Find in Chat', () => {
      render(<WorkbenchMenuBar />);
      fireEvent.click(screen.getByText('Edit'));
      expect(screen.getByText('Find in Chat')).toBeDefined();
    });

    it('clicking View opens its dropdown with Toggle Outer Rail', () => {
      render(<WorkbenchMenuBar />);
      fireEvent.click(screen.getByText('View'));
      expect(screen.getByText('Toggle Outer Rail')).toBeDefined();
    });

    it('clicking Tools opens its dropdown with Settings', () => {
      render(<WorkbenchMenuBar />);
      fireEvent.click(screen.getByText('Tools'));
      expect(screen.getByText('Settings')).toBeDefined();
    });

    it('clicking Help opens its dropdown with About Ouroboros', () => {
      render(<WorkbenchMenuBar />);
      fireEvent.click(screen.getByText('Help'));
      expect(screen.getByText('About Ouroboros')).toBeDefined();
    });
  });

  describe('item dispatch', () => {
    let dispatched: string[];

    beforeEach(() => {
      dispatched = [];
      vi.spyOn(window, 'dispatchEvent').mockImplementation((evt: Event) => {
        dispatched.push(evt.type);
        return true;
      });
    });

    afterEach(() => vi.restoreAllMocks());

    it('Find in Chat dispatches agent-ide:open-chat-search', () => {
      render(<WorkbenchMenuBar />);
      fireEvent.click(screen.getByText('Edit'));
      fireEvent.click(screen.getByText('Find in Chat'));
      expect(dispatched).toContain('agent-ide:open-chat-search');
    });

    it('Toggle Outer Rail dispatches agent-ide:workbench-toggle-outer-rail', () => {
      render(<WorkbenchMenuBar />);
      fireEvent.click(screen.getByText('View'));
      fireEvent.click(screen.getByText('Toggle Outer Rail'));
      expect(dispatched).toContain('agent-ide:workbench-toggle-outer-rail');
    });

    it('New Session dispatches agent-ide:workbench-new-session', () => {
      render(<WorkbenchMenuBar />);
      fireEvent.click(screen.getByText('File'));
      fireEvent.click(screen.getByText('New Session'));
      expect(dispatched).toContain('agent-ide:workbench-new-session');
    });

    it('Exit Chat Mode dispatches agent-ide:toggle-immersive-chat', () => {
      render(<WorkbenchMenuBar />);
      fireEvent.click(screen.getByText('File'));
      fireEvent.click(screen.getByText('Exit Chat Mode'));
      expect(dispatched).toContain('agent-ide:toggle-immersive-chat');
    });
  });

  describe('keyboard shortcuts', () => {
    it('Alt+F opens the File menu', () => {
      render(<WorkbenchMenuBar />);
      fireEvent.keyDown(document, { key: 'f', altKey: true });
      expect(screen.getByText('New Session')).toBeDefined();
    });

    it('Alt+E opens the Edit menu', () => {
      render(<WorkbenchMenuBar />);
      fireEvent.keyDown(document, { key: 'e', altKey: true });
      expect(screen.getByText('Find in Chat')).toBeDefined();
    });

    it('Alt+V opens the View menu', () => {
      render(<WorkbenchMenuBar />);
      fireEvent.keyDown(document, { key: 'v', altKey: true });
      expect(screen.getByText('Toggle Outer Rail')).toBeDefined();
    });

    it('Alt+T opens the Tools menu', () => {
      render(<WorkbenchMenuBar />);
      fireEvent.keyDown(document, { key: 't', altKey: true });
      expect(screen.getByText('Settings')).toBeDefined();
    });

    it('Alt+H opens the Help menu', () => {
      render(<WorkbenchMenuBar />);
      fireEvent.keyDown(document, { key: 'h', altKey: true });
      expect(screen.getByText('About Ouroboros')).toBeDefined();
    });

    it('Escape closes an open menu', () => {
      render(<WorkbenchMenuBar />);
      fireEvent.keyDown(document, { key: 'f', altKey: true });
      expect(screen.getByText('New Session')).toBeDefined();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByText('New Session')).toBeNull();
    });
  });
});
