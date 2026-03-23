/**
 * TitleBar.mobile.tsx — Mobile hamburger and overflow menus.
 * Extracted to keep TitleBar.tsx under 300 lines.
 */

import React, { useEffect, useRef, useState } from 'react';

import { useToastContext } from '../../contexts/ToastContext';
import { NotificationBadge } from '../shared/NotificationCenter';
import type { TitleBarAction } from './TitleBar';
import { getMenuDefinitions } from './TitleBar.menus';
import { dropdownStyle, MenuItemRow, menuItemRowStyle, separatorStyle } from './TitleBar.navbar';

function useOutsideClick(ref: React.RefObject<HTMLElement | null>, isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [ref, isOpen, onClose]);
}

const MOBILE_ITEM_STYLE: React.CSSProperties = {
  ...menuItemRowStyle, height: '32px', borderRadius: '4px',
  margin: '0 4px', width: 'calc(100% - 8px)',
};

function MobileMenuItem({ label, onClick, disabled }: { label: string; onClick?: () => void; disabled?: boolean }): React.ReactElement {
  return (
    <button onClick={onClick} disabled={disabled} className="titlebar-no-drag text-text-semantic-primary"
      style={{ ...MOBILE_ITEM_STYLE, opacity: disabled ? 0.4 : 1 }}
      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--interactive-accent) 15%, transparent)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}>
      <span style={{ flex: 1 }}>{label}</span>
    </button>
  );
}

export function MobileHamburgerMenu({ titleButtonStyle, hoverStyle }: { titleButtonStyle: React.CSSProperties; hoverStyle: object }): React.ReactElement {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menus = getMenuDefinitions();
  useOutsideClick(containerRef, open, () => setOpen(false));
  return (
    <div ref={containerRef} className="titlebar-no-drag web-mobile-only" style={{ position: 'relative', height: '100%', display: 'none' }}>
      <button className="titlebar-no-drag" title="Menu" onClick={() => setOpen((v) => !v)} style={titleButtonStyle} {...hoverStyle}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <line x1="2" y1="4" x2="14" y2="4" /><line x1="2" y1="8" x2="14" y2="8" /><line x1="2" y1="12" x2="14" y2="12" />
        </svg>
      </button>
      {open && (
        <div role="menu" style={{ ...dropdownStyle, maxHeight: '70vh', overflowY: 'auto', padding: '6px 0' }}>
          {menus.map((menu) => (
            <React.Fragment key={menu.label}>
              <div className="text-text-semantic-faint select-none" style={{ padding: '8px 12px 4px', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {menu.label}
              </div>
              {menu.items.map((item, i) =>
                item.divider ? <div key={`sep-${i}`} style={separatorStyle} /> : (
                  <MobileMenuItem key={item.label} label={item.label} onClick={() => { item.action?.(); setOpen(false); }} disabled={item.disabled} />
                ),
              )}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

export function MobileOverflowMenu({ titleBarActions, titleButtonStyle, hoverStyle }: {
  titleBarActions: TitleBarAction[]; titleButtonStyle: React.CSSProperties; hoverStyle: object;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { notifications, unreadCount, markAllRead, removeNotification, clearAllNotifications } = useToastContext();
  useOutsideClick(containerRef, open, () => setOpen(false));

  return (
    <div ref={containerRef} className="titlebar-no-drag web-mobile-only" style={{ position: 'relative', height: '100%', display: 'none' }}>
      <button className="titlebar-no-drag" title="More"
        onClick={() => { setOpen((v) => !v); if (!open && unreadCount > 0) markAllRead(); }}
        style={titleButtonStyle} {...hoverStyle}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="3" r="1.5" /><circle cx="8" cy="8" r="1.5" /><circle cx="8" cy="13" r="1.5" />
        </svg>
        {unreadCount > 0 && <NotificationBadge count={unreadCount} />}
      </button>
      {open && (
        <MobileOverflowDropdown titleBarActions={titleBarActions} notifications={notifications}
          unreadCount={unreadCount} onClose={() => setOpen(false)}
          onRemove={removeNotification} onClearAll={clearAllNotifications} />
      )}
    </div>
  );
}

function MobileOverflowDropdown({ titleBarActions, notifications, unreadCount, onClose, onRemove, onClearAll }: {
  titleBarActions: TitleBarAction[];
  notifications: ReturnType<typeof useToastContext>['notifications'];
  unreadCount: number; onClose: () => void;
  onRemove: (id: string) => void; onClearAll: () => void;
}): React.ReactElement {
  return (
    <div role="menu" style={{ ...dropdownStyle, right: 0, left: 'auto', padding: '6px 0' }}>
      {titleBarActions.map((action) => (
        <button key={action.eventName}
          onClick={() => { window.dispatchEvent(new CustomEvent(action.eventName)); onClose(); }}
          className="titlebar-no-drag text-text-semantic-primary" style={MOBILE_ITEM_STYLE}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--interactive-accent) 15%, transparent)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}>
          <action.Icon /><span style={{ marginLeft: 8, flex: 1 }}>{action.title}</span>
        </button>
      ))}
      <div style={separatorStyle} />
      <MobileMenuItem label={`Notifications${unreadCount > 0 ? ` (${unreadCount})` : ''}`} onClick={onClose} />
      {notifications.length > 0 && (
        <div className="border-t border-border-semantic" style={{ maxHeight: '200px', overflowY: 'auto' }}>
          {notifications.slice(0, 5).map((n) => (
            <div key={n.id} className="text-text-semantic-muted" style={{ padding: '4px 12px', fontSize: '11px' }}>
              {n.message}
              <button onClick={() => onRemove(n.id)} className="text-text-semantic-faint" style={{ marginLeft: 8, fontSize: '10px' }}>×</button>
            </div>
          ))}
          {notifications.length > 5 && <div className="text-text-semantic-faint" style={{ padding: '4px 12px', fontSize: '10px' }}>+{notifications.length - 5} more</div>}
          <button onClick={onClearAll} className="text-text-semantic-faint"
            style={{ ...menuItemRowStyle, fontSize: '11px', height: '28px', borderRadius: '4px', margin: '0 4px', width: 'calc(100% - 8px)' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}>
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}

// Re-export the MenuItemRow ref type for use in TitleBar
export { MenuItemRow };
