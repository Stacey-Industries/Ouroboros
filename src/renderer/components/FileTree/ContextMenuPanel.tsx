import React, { useEffect } from 'react';
import type { MenuItem } from './useContextMenuController';

function MenuSeparator(): React.ReactElement {
  return (
    <div
      style={{
        height: '1px',
        margin: '4px 8px',
        background: 'var(--border-muted, var(--border))',
      }}
    />
  );
}

function MenuButton({
  item,
}: {
  item: MenuItem;
}): React.ReactElement {
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      onClick={item.action}
      style={{
        width: '100%',
        padding: '6px 12px',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        color: item.danger ? 'var(--error, #e55)' : 'var(--text)',
        whiteSpace: 'nowrap',
        userSelect: 'none',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '16px',
        textAlign: 'left',
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.backgroundColor = item.danger
          ? 'rgba(255, 80, 80, 0.12)'
          : 'rgba(var(--accent-rgb, 88, 166, 255), 0.15)';
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      <span>{item.label}</span>
      {item.shortcut && (
        <span
          style={{
            fontSize: '0.6875rem',
            color: 'var(--text-faint)',
            fontFamily: 'var(--font-ui)',
          }}
        >
          {item.shortcut}
        </span>
      )}
    </button>
  );
}

export function ContextMenuPanel({
  items,
  menuRef,
  visible,
  x,
  y,
}: {
  items: MenuItem[];
  menuRef: React.RefObject<HTMLDivElement | null>;
  visible: boolean;
  x: number;
  y: number;
}): React.ReactElement {
  useEffect(() => {
    if (!visible || !menuRef.current) {
      return;
    }

    const rect = menuRef.current.getBoundingClientRect();
    const maxLeft = Math.max(4, window.innerWidth - rect.width - 4);
    const maxTop = Math.max(4, window.innerHeight - rect.height - 4);

    menuRef.current.style.left = `${Math.min(Math.max(4, x), maxLeft)}px`;
    menuRef.current.style.top = `${Math.min(Math.max(4, y), maxTop)}px`;
  }, [items.length, menuRef, visible, x, y]);

  return (
    <div
      ref={menuRef}
      role="menu"
      style={{
        position: 'fixed',
        left: x,
        top: y,
        zIndex: 9999,
        minWidth: '200px',
        padding: '4px 0',
        background: 'var(--bg-secondary, var(--bg))',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
        fontFamily: 'var(--font-ui)',
        fontSize: '0.8125rem',
      }}
    >
      {items.map((item) => (
        <React.Fragment key={item.label}>
          {item.separator && <MenuSeparator />}
          <MenuButton item={item} />
        </React.Fragment>
      ))}
    </div>
  );
}
