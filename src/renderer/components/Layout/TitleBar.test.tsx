/**
 * Smoke tests for TitleBar.tsx
 */

import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { render } from '../../../_test_utils/renderWithProviders';
import { TitleBar } from './TitleBar';

vi.mock('../../hooks/useProgressSubscriptions', () => ({ useProgressSubscriptions: vi.fn() }));
vi.mock('../../hooks/useImmersiveChatFlag', () => ({ useImmersiveChatFlag: () => false }));
vi.mock('../../contexts/ToastContext', () => ({
  useToastContext: () => ({ notifications: [], unreadCount: 0, markAllRead: vi.fn(), removeNotification: vi.fn(), clearAllNotifications: vi.fn() }),
}));
vi.mock('../../hooks/useViewportBreakpoint', () => ({ useViewportBreakpoint: () => 'desktop' }));
vi.mock('../../contexts/MobileLayoutContext', () => ({ useMobileLayout: () => ({ openDrawer: vi.fn() }) }));
vi.mock('../shared/NotificationCenter', () => ({
  BellIcon: () => <svg />,
  NotificationBadge: () => null,
  NotificationCenter: () => null,
}));
vi.mock('../shared/ProductIcon', () => ({
  ProductIcon: ({ fallback }: { fallback: React.ReactNode }) => <>{fallback}</>,
}));

describe('TitleBar', () => {
  it('renders without crashing', () => {
    const { container } = render(<TitleBar />);
    expect(container.querySelector('[data-layout="title-bar"]')).toBeTruthy();
  });

  it('renders with collapsed and onTogglePanel props', () => {
    const collapsed = { leftSidebar: false, rightSidebar: false, terminal: false, editor: false };
    const onTogglePanel = vi.fn();
    const { container } = render(<TitleBar collapsed={collapsed} onTogglePanel={onTogglePanel} />);
    expect(container.querySelector('[data-layout="title-bar"]')).toBeTruthy();
  });
});
