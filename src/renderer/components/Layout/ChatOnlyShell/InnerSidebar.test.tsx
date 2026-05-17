/**
 * @vitest-environment jsdom
 *
 * InnerSidebar — unit tests (Wave 59 Phase B).
 *
 * Verifies:
 *  - Renders without throwing.
 *  - Header shows the project display name.
 *  - Tab strip renders all three tabs.
 *  - The active tab has aria-selected="true".
 *  - Clicking a tab calls onSelectTab with the correct id.
 *  - Only the active tab panel is visible (hidden attr on inactive panels).
 *  - Custom content is rendered in the correct panel.
 *  - Footer renders.
 *  - "No project" shown when activeProject is null.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InnerSidebar } from './InnerSidebar';

afterEach(() => cleanup());

function makeProps(
  overrides: Partial<React.ComponentProps<typeof InnerSidebar>> = {},
): React.ComponentProps<typeof InnerSidebar> {
  return {
    activeProject: '/home/user/my-project',
    activeTab: 'chats',
    onSelectTab: vi.fn(),
    ...overrides,
  };
}

describe('InnerSidebar', () => {
  it('renders without throwing', () => {
    const { container } = render(<InnerSidebar {...makeProps()} />);
    expect(container).toBeDefined();
  });

  it('shows the project name in the header', () => {
    render(<InnerSidebar {...makeProps()} />);
    const header = screen.getByTestId('inner-sidebar-header');
    expect(header.textContent).toContain('my-project');
  });

  it('shows "No project" when activeProject is null', () => {
    render(<InnerSidebar {...makeProps({ activeProject: null })} />);
    expect(screen.getByTestId('inner-sidebar-header').textContent).toContain('No project');
  });

  it('renders only terminals and code tabs (chats hidden post-Wave-89 pivot)', () => {
    render(<InnerSidebar {...makeProps()} />);
    expect(screen.queryByTestId('inner-sidebar-tab-chats')).toBeNull();
    expect(screen.getByTestId('inner-sidebar-tab-terminals')).toBeDefined();
    expect(screen.getByTestId('inner-sidebar-tab-code')).toBeDefined();
  });

  it('marks active tab with aria-selected=true', () => {
    render(<InnerSidebar {...makeProps({ activeTab: 'terminals' })} />);
    expect(screen.getByTestId('inner-sidebar-tab-terminals').getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('persisted activeTab="chats" coerces to terminals (chats tab hidden)', () => {
    render(<InnerSidebar {...makeProps({ activeTab: 'chats' })} />);
    expect(screen.getByTestId('inner-sidebar-tab-terminals').getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(screen.getByTestId('inner-sidebar-tab-code').getAttribute('aria-selected')).toBe(
      'false',
    );
  });

  it('calls onSelectTab with the correct id on click', () => {
    const onSelectTab = vi.fn();
    render(<InnerSidebar {...makeProps({ onSelectTab })} />);
    fireEvent.click(screen.getByTestId('inner-sidebar-tab-code'));
    expect(onSelectTab).toHaveBeenCalledWith('code');
  });

  it('active panel is not hidden', () => {
    render(<InnerSidebar {...makeProps({ activeTab: 'terminals' })} />);
    const panel = screen.getByTestId('inner-sidebar-panel-terminals');
    expect(panel.hasAttribute('hidden')).toBe(false);
  });

  it('inactive panels are hidden', () => {
    render(<InnerSidebar {...makeProps({ activeTab: 'terminals' })} />);
    expect(screen.getByTestId('inner-sidebar-panel-code').hasAttribute('hidden')).toBe(true);
  });

  it('chats panel is never rendered (chats tab hidden)', () => {
    render(<InnerSidebar {...makeProps({ activeTab: 'chats' })} />);
    expect(screen.queryByTestId('inner-sidebar-panel-chats')).toBeNull();
  });

  it('does not render chatsContent even when provided (chats tab hidden)', () => {
    const content = <div data-testid="custom-chats">Custom Chats</div>;
    render(<InnerSidebar {...makeProps({ chatsContent: content, activeTab: 'chats' })} />);
    expect(screen.queryByTestId('custom-chats')).toBeNull();
  });

  it('renders custom terminalsContent in the terminals panel', () => {
    const content = <div data-testid="custom-terminals">Custom Terminals</div>;
    render(<InnerSidebar {...makeProps({ terminalsContent: content, activeTab: 'terminals' })} />);
    expect(screen.getByTestId('custom-terminals')).toBeDefined();
  });

  it('renders custom codeContent in the code panel', () => {
    const content = <div data-testid="custom-code">Custom Code</div>;
    render(<InnerSidebar {...makeProps({ codeContent: content, activeTab: 'code' })} />);
    expect(screen.getByTestId('custom-code')).toBeDefined();
  });

  it('does not render a sidebar footer (Wave 82 — removed redundant Workspace label)', () => {
    render(<InnerSidebar {...makeProps()} />);
    expect(screen.queryByTestId('inner-sidebar-footer')).toBeNull();
  });
});
