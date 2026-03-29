import React, { useEffect } from 'react';

import type { MenuItem } from './useContextMenuController';

const MENU_SEPARATOR_STYLE: React.CSSProperties = {
  height: '1px',
  margin: '4px 8px',
  background: 'var(--border-subtle)',
};

const MENU_BUTTON_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '6px 12px',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  userSelect: 'none',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '16px',
  textAlign: 'left',
};

const MENU_SHORTCUT_STYLE: React.CSSProperties = {
  fontSize: '0.6875rem',
  fontFamily: 'var(--font-ui)',
};

const MENU_PANEL_STYLE: React.CSSProperties = {
  position: 'fixed',
  zIndex: 9999,
  minWidth: '200px',
  padding: '4px 0',
  borderRadius: '6px',
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
  fontFamily: 'var(--font-ui)',
  fontSize: '0.8125rem',
};

interface MenuButtonProps {
  item: MenuItem;
}

interface ContextMenuPanelProps {
  items: MenuItem[];
  menuRef: React.RefObject<HTMLDivElement | null>;
  visible: boolean;
  x: number;
  y: number;
}

function MenuSeparator(): React.ReactElement<any> {
  return <div style={MENU_SEPARATOR_STYLE} />;
}

function getMenuButtonColor(item: MenuItem): string {
  return item.danger ? 'var(--status-error)' : 'var(--text-primary)';
}

function getMenuHoverColor(item: MenuItem): string {
  return item.danger ? 'rgba(255, 80, 80, 0.12)' : 'rgba(var(--accent-rgb, 88, 166, 255), 0.15)';
}

function setMenuHoverColor(target: HTMLButtonElement, item: MenuItem): void {
  target.style.backgroundColor = getMenuHoverColor(item);
}

function clearMenuHoverColor(target: HTMLButtonElement): void {
  target.style.backgroundColor = 'transparent';
}

function MenuShortcut({ shortcut }: { shortcut?: string }): React.ReactElement<any> | null {
  if (!shortcut) {
    return null;
  }

  return (
    <span className="text-text-semantic-faint" style={MENU_SHORTCUT_STYLE}>
      {shortcut}
    </span>
  );
}

function useConstrainedMenuPosition({
  itemCount,
  menuRef,
  visible,
  x,
  y,
}: {
  itemCount: number;
  menuRef: React.RefObject<HTMLDivElement | null>;
  visible: boolean;
  x: number;
  y: number;
}): void {
  useEffect(() => {
    if (!visible || !menuRef.current) {
      return;
    }

    const rect = menuRef.current.getBoundingClientRect();
    const maxLeft = Math.max(4, window.innerWidth - rect.width - 4);
    const maxTop = Math.max(4, window.innerHeight - rect.height - 4);

    menuRef.current.style.left = `${Math.min(Math.max(4, x), maxLeft)}px`;
    menuRef.current.style.top = `${Math.min(Math.max(4, y), maxTop)}px`;
  }, [itemCount, menuRef, visible, x, y]);
}

function MenuButton({ item }: MenuButtonProps): React.ReactElement<any> {
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      onClick={item.action}
      style={{ ...MENU_BUTTON_STYLE, color: getMenuButtonColor(item) }}
      onMouseEnter={(event) => setMenuHoverColor(event.currentTarget, item)}
      onMouseLeave={(event) => clearMenuHoverColor(event.currentTarget)}
    >
      <span>{item.label}</span>
      <MenuShortcut shortcut={item.shortcut} />
    </button>
  );
}

function MenuItems({ items }: { items: MenuItem[] }): React.ReactElement<any> {
  return (
    <>
      {items.map((item) => (
        <React.Fragment key={item.label}>
          {item.separator && <MenuSeparator />}
          <MenuButton item={item} />
        </React.Fragment>
      ))}
    </>
  );
}

export function ContextMenuPanel({
  items,
  menuRef,
  visible,
  x,
  y,
}: ContextMenuPanelProps): React.ReactElement<any> {
  useConstrainedMenuPosition({ itemCount: items.length, menuRef, visible, x, y });

  return (
    <div
      ref={menuRef as React.RefObject<HTMLDivElement | null>}
      role="menu"
      className="bg-surface-panel border border-border-semantic"
      style={{ ...MENU_PANEL_STYLE, left: x, top: y }}
    >
      <MenuItems items={items} />
    </div>
  );
}
