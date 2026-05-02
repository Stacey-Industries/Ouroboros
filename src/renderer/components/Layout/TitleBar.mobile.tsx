/**
 * TitleBar.mobile.tsx — Mobile hamburger, overflow menus, and file-tree trigger.
 * Extracted to keep TitleBar.tsx under 300 lines.
 *
 * Wave 32 Phase F: MobileFileTreeButton opens the left-sidebar drawer via
 * MobileLayoutContext so users can reach the file tree from any panel.
 */

import React, { useRef, useState } from 'react';

import { useMobileLayout } from '../../contexts/MobileLayoutContext';
import { useToastContext } from '../../contexts/ToastContext';
import { useOutsideClick } from '../../hooks/useOutsideClick';
import { useViewportBreakpoint } from '../../hooks/useViewportBreakpoint';
import { NotificationBadge } from '../shared/NotificationCenter';
import type { TitleBarAction } from './TitleBar';
import { getMenuDefinitions } from './TitleBar.menus';
import { dropdownStyle, MenuItemRow, menuItemRowStyle, separatorStyle } from './TitleBar.navbar';

const MOBILE_ITEM_STYLE: React.CSSProperties = {
  ...menuItemRowStyle,
  height: '32px',
  borderRadius: '4px',
  margin: '0 4px',
  width: 'calc(100% - 8px)',
};

function MobileMenuItem({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="titlebar-no-drag text-text-semantic-primary"
      style={{ ...MOBILE_ITEM_STYLE, opacity: disabled ? 0.4 : 1 }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor =
          'color-mix(in srgb, var(--interactive-accent) 15%, transparent)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      <span style={{ flex: 1 }}>{label}</span>
    </button>
  );
}

const HAMBURGER_MENU_LABEL_STYLE: React.CSSProperties = {
  padding: '8px 12px 4px', fontSize: '10px', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.06em',
};

const HAMBURGER_DROPDOWN_STYLE: React.CSSProperties = {
  ...dropdownStyle, position: 'absolute', top: '100%', left: 0,
  maxHeight: '70vh', overflowY: 'auto', padding: '6px 0',
};

function HamburgerIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="2" y1="4" x2="14" y2="4" />
      <line x1="2" y1="8" x2="14" y2="8" />
      <line x1="2" y1="12" x2="14" y2="12" />
    </svg>
  );
}

function HamburgerMenuList({ menus, onClose }: { menus: ReturnType<typeof getMenuDefinitions>; onClose: () => void }): React.ReactElement {
  return (
    <div role="menu" style={HAMBURGER_DROPDOWN_STYLE}>
      {menus.map((menu) => (
        <React.Fragment key={menu.label}>
          <div className="text-text-semantic-faint select-none" style={HAMBURGER_MENU_LABEL_STYLE}>{menu.label}</div>
          {menu.items.map((item, i) =>
            item.divider ? (
              <div key={`sep-${i}`} style={separatorStyle} />
            ) : (
              <MobileMenuItem key={item.label} label={item.label} disabled={item.disabled}
                onClick={() => { item.action?.(); onClose(); }}
              />
            ),
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

export function MobileHamburgerMenu({
  titleButtonStyle,
  hoverStyle,
}: {
  titleButtonStyle: React.CSSProperties;
  hoverStyle: Pick<React.HTMLAttributes<HTMLButtonElement>, 'onMouseEnter' | 'onMouseLeave'>;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menus = getMenuDefinitions();
  useOutsideClick(containerRef, open, () => setOpen(false));
  return (
    <div ref={containerRef} className="titlebar-no-drag web-mobile-only"
      style={{ position: 'relative', height: '100%', display: 'none' }}
    >
      <button className="titlebar-no-drag" title="Menu" onClick={() => setOpen((v) => !v)} style={titleButtonStyle} {...hoverStyle}>
        <HamburgerIcon />
      </button>
      {open && <HamburgerMenuList menus={menus} onClose={() => setOpen(false)} />}
    </div>
  );
}

function OverflowDotsIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="8" cy="3" r="1.5" />
      <circle cx="8" cy="8" r="1.5" />
      <circle cx="8" cy="13" r="1.5" />
    </svg>
  );
}

export function MobileOverflowMenu({
  titleBarActions, titleButtonStyle, hoverStyle,
}: {
  titleBarActions: TitleBarAction[];
  titleButtonStyle: React.CSSProperties;
  hoverStyle: Pick<React.HTMLAttributes<HTMLButtonElement>, 'onMouseEnter' | 'onMouseLeave'>;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { notifications, unreadCount, markAllRead, removeNotification, clearAllNotifications } = useToastContext();
  useOutsideClick(containerRef, open, () => setOpen(false));
  return (
    <div ref={containerRef} className="titlebar-no-drag web-mobile-only"
      style={{ position: 'relative', height: '100%', display: 'none' }}
    >
      <button className="titlebar-no-drag" title="More"
        onClick={() => { setOpen((v) => !v); if (!open && unreadCount > 0) markAllRead(); }}
        style={titleButtonStyle} {...hoverStyle}
      >
        <OverflowDotsIcon />
        {unreadCount > 0 && <NotificationBadge count={unreadCount} />}
      </button>
      {open && (
        <MobileOverflowDropdown titleBarActions={titleBarActions} notifications={notifications}
          unreadCount={unreadCount} onClose={() => setOpen(false)}
          onRemove={removeNotification} onClearAll={clearAllNotifications}
        />
      )}
    </div>
  );
}

const OVERFLOW_DROPDOWN_STYLE: React.CSSProperties = { ...dropdownStyle, position: 'absolute', top: '100%', right: 0, left: 'auto', padding: '6px 0' };
const CLEAR_ALL_STYLE: React.CSSProperties = { ...menuItemRowStyle, fontSize: '11px', height: '28px', borderRadius: '4px', margin: '0 4px', width: 'calc(100% - 8px)' };

type ToastNotifications = ReturnType<typeof useToastContext>['notifications'];

function OverflowActionButtons({ titleBarActions, onClose }: { titleBarActions: TitleBarAction[]; onClose: () => void }): React.ReactElement {
  return (
    <>
      {titleBarActions.map((action) => (
        <button key={action.eventName} onClick={() => { window.dispatchEvent(new CustomEvent(action.eventName)); onClose(); }}
          className="titlebar-no-drag text-text-semantic-primary" style={MOBILE_ITEM_STYLE}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--interactive-accent) 15%, transparent)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
        >
          <action.Icon />
          <span style={{ marginLeft: 8, flex: 1 }}>{action.title}</span>
        </button>
      ))}
    </>
  );
}

function OverflowNotifications({ notifications, onRemove, onClearAll }: { notifications: ToastNotifications; onRemove: (id: string) => void; onClearAll: () => void }): React.ReactElement {
  return (
    <div className="border-t border-border-semantic" style={{ maxHeight: '200px', overflowY: 'auto' }}>
      {notifications.slice(0, 5).map((n) => (
        <div key={n.id} className="text-text-semantic-muted" style={{ padding: '4px 12px', fontSize: '11px' }}>
          {n.message}
          <button onClick={() => onRemove(n.id)} className="text-text-semantic-faint" style={{ marginLeft: 8, fontSize: '10px' }}>×</button>
        </div>
      ))}
      {notifications.length > 5 && (
        <div className="text-text-semantic-faint" style={{ padding: '4px 12px', fontSize: '10px' }}>+{notifications.length - 5} more</div>
      )}
      {/* touch-target-ok — mobile.css [data-layout='title-bar'] button rule sets min-height:44px; CSS min-height beats inline height */}
      <button onClick={onClearAll} className="text-text-semantic-faint" style={CLEAR_ALL_STYLE}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
      >Clear all</button>
    </div>
  );
}

function MobileOverflowDropdown({ titleBarActions, notifications, unreadCount, onClose, onRemove, onClearAll }: {
  titleBarActions: TitleBarAction[];
  notifications: ToastNotifications;
  unreadCount: number;
  onClose: () => void;
  onRemove: (id: string) => void;
  onClearAll: () => void;
}): React.ReactElement {
  return (
    <div role="menu" style={OVERFLOW_DROPDOWN_STYLE}>
      <OverflowActionButtons titleBarActions={titleBarActions} onClose={onClose} />
      <div style={separatorStyle} />
      <MobileMenuItem label={`Notifications${unreadCount > 0 ? ` (${unreadCount})` : ''}`} onClick={onClose} />
      {notifications.length > 0 && <OverflowNotifications notifications={notifications} onRemove={onRemove} onClearAll={onClearAll} />}
    </div>
  );
}

// ── MobileFileTreeButton ──────────────────────────────────────────────────────

/**
 * Renders a file-tree icon button in the title bar on phone viewports.
 * Tapping it opens the left-sidebar drawer so users can browse files from
 * any active panel without switching the bottom nav to "Files".
 */
export function MobileFileTreeButton({
  titleButtonStyle,
  hoverStyle,
}: {
  titleButtonStyle: React.CSSProperties;
  hoverStyle: Pick<React.HTMLAttributes<HTMLButtonElement>, 'onMouseEnter' | 'onMouseLeave'>;
}): React.ReactElement | null {
  const breakpoint = useViewportBreakpoint();
  const { openDrawer } = useMobileLayout();
  if (breakpoint !== 'phone') return null;
  return (
    <button
      className="titlebar-no-drag web-mobile-only"
      title="File tree"
      aria-label="Open file tree"
      onClick={openDrawer}
      style={{ ...titleButtonStyle, display: 'flex' }}
      {...hoverStyle}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      >
        <rect x="5" y="2" width="10" height="13" rx="1.5" />
        <rect x="3" y="5" width="10" height="13" rx="1.5" fill="var(--surface-panel)" />
      </svg>
    </button>
  );
}

// Re-export the MenuItemRow ref type for use in TitleBar
export { MenuItemRow };
