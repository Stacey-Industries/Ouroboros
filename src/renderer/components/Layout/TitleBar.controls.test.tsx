/**
 * Smoke tests for TitleBar.controls.tsx — WindowControls, NotificationBell, PanelToggleBar.
 */

import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { render } from '../../../_test_utils/renderWithProviders';
import { NotificationBell, PanelToggleBar, WindowControls } from './TitleBar.controls';

vi.mock('../../contexts/ToastContext', () => ({
  useToastContext: () => ({
    notifications: [],
    unreadCount: 0,
    markAllRead: vi.fn(),
    removeNotification: vi.fn(),
    clearAllNotifications: vi.fn(),
  }),
}));

vi.mock('../shared/NotificationCenter', () => ({
  BellIcon: () => <svg data-testid="bell-icon" />,
  NotificationBadge: () => null,
  NotificationCenter: () => null,
}));

vi.mock('../shared/ProductIcon', () => ({
  ProductIcon: ({ fallback }: { fallback: React.ReactNode }) => <>{fallback}</>,
}));

describe('WindowControls', () => {
  it('renders null when platform is not win32', () => {
    const { container } = render(<WindowControls />);
    expect(container.firstChild).toBeNull();
  });
});

describe('NotificationBell', () => {
  it('renders the bell button', () => {
    const { getByTitle } = render(<NotificationBell />);
    expect(getByTitle('Notifications')).toBeTruthy();
  });
});

describe('PanelToggleBar', () => {
  it('renders null when collapsed is undefined', () => {
    const { container } = render(
      <PanelToggleBar panelToggles={[]} collapsed={undefined} onToggle={undefined} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders toggle buttons for each panel config', () => {
    const MockIcon = (): React.ReactElement => <svg />;
    const toggles = [{ panel: 'leftSidebar' as const, title: 'Sidebar', Icon: MockIcon }];
    const collapsed = { leftSidebar: false, rightSidebar: false, terminal: false, editor: false };
    const onToggle = vi.fn();
    const { getByTitle } = render(
      <PanelToggleBar panelToggles={toggles} collapsed={collapsed} onToggle={onToggle} />,
    );
    expect(getByTitle('Hide Sidebar')).toBeTruthy();
  });
});
