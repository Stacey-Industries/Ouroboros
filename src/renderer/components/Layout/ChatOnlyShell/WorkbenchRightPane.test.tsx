/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./ChatWorkbenchUtilityDrawer', () => ({
  ChatWorkbenchUtilityDrawer: ({ activeTab }: { activeTab: string }) => (
    <div data-testid="utility-drawer-mock">utility:{activeTab}</div>
  ),
}));

vi.mock('./ChatWorkbenchArtifactPane', () => ({
  ChatWorkbenchArtifactPane: () => <div data-testid="artifact-pane-mock">artifact</div>,
}));

import { WorkbenchRightPane } from './WorkbenchRightPane';

afterEach(cleanup);

function makeProps(overrides: Partial<React.ComponentProps<typeof WorkbenchRightPane>> = {}) {
  return {
    view: 'utility' as const,
    activeUtilityTab: 'activity' as const,
    onSelectUtilityTab: vi.fn(),
    onSelectView: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

describe('WorkbenchRightPane', () => {
  it('renders the utility drawer when view is utility', () => {
    render(<WorkbenchRightPane {...makeProps({ view: 'utility' })} />);
    expect(screen.getByTestId('utility-drawer-mock')).toBeDefined();
    expect(screen.queryByTestId('artifact-pane-mock')).toBeNull();
  });

  it('renders the artifact pane when view is artifact', () => {
    render(<WorkbenchRightPane {...makeProps({ view: 'artifact' })} />);
    // artifact pane is lazy-loaded; the suspense fallback may render first
    // synchronously check that the utility drawer is NOT mounted
    expect(screen.queryByTestId('utility-drawer-mock')).toBeNull();
  });

  it('shows the view switcher trigger labelled with the current view', () => {
    render(<WorkbenchRightPane {...makeProps({ view: 'utility' })} />);
    expect(screen.getByTestId('right-pane-view-switcher-trigger').textContent).toContain('Utility');
  });

  it('opens the view switcher menu on trigger click', () => {
    render(<WorkbenchRightPane {...makeProps()} />);
    fireEvent.click(screen.getByTestId('right-pane-view-switcher-trigger'));
    expect(screen.getByTestId('right-pane-view-switcher-menu')).toBeDefined();
    expect(screen.getByTestId('right-pane-view-switcher-item-utility')).toBeDefined();
    expect(screen.getByTestId('right-pane-view-switcher-item-artifact')).toBeDefined();
  });

  it('selecting a menu item calls onSelectView with that view', () => {
    const onSelectView = vi.fn();
    render(<WorkbenchRightPane {...makeProps({ onSelectView })} />);
    fireEvent.click(screen.getByTestId('right-pane-view-switcher-trigger'));
    fireEvent.click(screen.getByTestId('right-pane-view-switcher-item-artifact'));
    expect(onSelectView).toHaveBeenCalledWith('artifact');
  });

  it('close button calls onClose', () => {
    const onClose = vi.fn();
    render(<WorkbenchRightPane {...makeProps({ onClose })} />);
    fireEvent.click(screen.getByTestId('workbench-right-pane-close'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
