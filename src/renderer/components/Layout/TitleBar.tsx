/**
 * TitleBar.tsx — Draggable window title bar with branding, dropdown menus, and action buttons.
 *
 * Dropdown menus (File, Edit, View, Go, Terminal, Help) provide quick access to common
 * actions, matching Cursor/Windsurf/VS Code navbar patterns. Menu definitions are data-driven
 * for easy extension. Keyboard navigation (arrows, Enter, Escape) is fully supported.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { OPEN_SETTINGS_PANEL_EVENT, SAVE_ALL_DIRTY_EVENT, SPLIT_EDITOR_EVENT } from '../../hooks/appEventNames';
import { useToastContext } from '../../contexts/ToastContext';
import { BellIcon, NotificationBadge, NotificationCenter } from '../shared/NotificationCenter';
import ouroborosLogo from '../../../../public/OUROBOROS.png';

/* ── Context-layer summarization progress (payload from main process) ── */

interface ContextLayerProgressPayload {
  type: 'idle' | 'summarizing';
  processed: number;
  failed: number;
  remaining: number;
  total: number;
  currentModule: string | null;
}

const progressWrapperStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '3px',
  pointerEvents: 'none',
};

const progressTextStyle: React.CSSProperties = {
  fontSize: '10px',
  color: 'var(--text-muted)',
  letterSpacing: '0.02em',
  whiteSpace: 'nowrap',
};

const progressTrackStyle: React.CSSProperties = {
  width: '120px',
  height: '2px',
  backgroundColor: 'var(--bg-tertiary)',
  borderRadius: '1px',
  overflow: 'hidden',
};

const progressFillStyle: React.CSSProperties = {
  height: '100%',
  backgroundColor: 'var(--accent)',
  borderRadius: '1px',
  transition: 'width 300ms ease',
};

function ContextLayerProgressIndicator(): React.ReactElement | null {
  const [progress, setProgress] = React.useState<ContextLayerProgressPayload | null>(null);
  const [showComplete, setShowComplete] = React.useState(false);
  const completeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    const api = (window as any).electronAPI?.contextLayer;
    if (!api?.onProgress) return;

    const cleanup = api.onProgress((payload: ContextLayerProgressPayload) => {
      if (payload.type === 'idle') {
        if (payload.processed > 0) {
          setShowComplete(true);
          completeTimerRef.current = setTimeout(() => {
            setShowComplete(false);
            setProgress(null);
          }, 3000);
        } else {
          setProgress(null);
        }
      } else {
        setShowComplete(false);
        setProgress(payload);
      }
    });

    return () => {
      cleanup();
      if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
    };
  }, []);

  if (showComplete) {
    return (
      <div style={progressWrapperStyle}>
        <span style={progressTextStyle}>Summaries updated</span>
      </div>
    );
  }

  if (!progress || progress.type === 'idle') return null;

  const percent = progress.total > 0
    ? Math.round((progress.processed / progress.total) * 100)
    : 0;

  return (
    <div style={progressWrapperStyle}>
      <span style={progressTextStyle}>
        Summarizing modules {progress.processed}/{progress.total}
      </span>
      <div style={progressTrackStyle}>
        <div style={{ ...progressFillStyle, width: `${percent}%` }} />
      </div>
    </div>
  );
}

function SettingsGearIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M2.93 2.93l1.06 1.06M11.99 11.99l1.07 1.07M13.07 2.93l-1.06 1.06M4.01 11.99l-1.07 1.07" />
    </svg>
  );
}

function UsageBarIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="8" width="3" height="7" rx="0.5" />
      <rect x="6.5" y="3" width="3" height="12" rx="0.5" />
      <rect x="12" y="1" width="3" height="14" rx="0.5" />
    </svg>
  );
}

const hoverStyle = {
  onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.color = 'var(--text)';
    e.currentTarget.style.backgroundColor = 'rgba(128,128,128,0.15)';
  },
  onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.color = 'var(--text-muted)';
    e.currentTarget.style.backgroundColor = 'transparent';
  },
};

const titleButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '100%',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--text-muted)',
  transition: 'color 150ms, background-color 150ms',
  flexShrink: 0,
};

interface TitleBarAction {
  eventName: string;
  title: string;
  Icon: () => React.ReactElement;
}

const TITLE_BAR_ACTIONS: TitleBarAction[] = [
  { eventName: OPEN_SETTINGS_PANEL_EVENT, title: 'Settings (Ctrl+,)', Icon: SettingsGearIcon },
  { eventName: 'agent-ide:open-usage-panel', title: 'Usage (Ctrl+U)', Icon: UsageBarIcon },
];

function TitleBarBranding(): React.ReactElement {
  return (
    <>
      <img
        className="titlebar-no-drag select-none"
        src={ouroborosLogo}
        alt="Ouroboros"
        style={{ height: '20px', width: '20px', marginLeft: '8px', marginRight: '6px', flexShrink: 0, objectFit: 'contain', opacity: 0.9 }}
        draggable={false}
      />
      <span
        className="select-none"
        style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginRight: '4px' }}
      >
        Ouroboros
      </span>
    </>
  );
}

function TitleBarActionButton({ eventName, title, Icon }: TitleBarAction): React.ReactElement {
  return (
    <button
      className="titlebar-no-drag"
      title={title}
      onClick={() => window.dispatchEvent(new CustomEvent(eventName))}
      style={titleButtonStyle}
      {...hoverStyle}
    >
      <Icon />
    </button>
  );
}

// ── Notification bell button (with badge + dropdown) ──────────────────────

function NotificationBell(): React.ReactElement {
  const { notifications, unreadCount, markAllRead, removeNotification, clearAllNotifications } = useToastContext();
  const [open, setOpen] = useState(false);

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      // Mark all as read when opening
      if (next && unreadCount > 0) markAllRead();
      return next;
    });
  }, [unreadCount, markAllRead]);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <div className="titlebar-no-drag" style={{ position: 'relative', height: '100%' }}>
      <button
        className="titlebar-no-drag"
        title="Notifications"
        onClick={toggle}
        style={titleButtonStyle}
        {...hoverStyle}
      >
        <BellIcon />
        <NotificationBadge count={unreadCount} />
      </button>
      {open && (
        <NotificationCenter
          notifications={notifications}
          onRemove={removeNotification}
          onClearAll={clearAllNotifications}
          onClose={handleClose}
        />
      )}
    </div>
  );
}

// ── Dropdown menu system ────────────────────────────────────────────────────

interface MenuItem {
  label: string;
  shortcut?: string;
  action?: () => void;
  divider?: boolean;
  disabled?: boolean;
}

interface MenuDefinition {
  label: string;
  items: MenuItem[];
}

const SEPARATOR: MenuItem = { label: '', divider: true };

function dispatchEvent(name: string, detail?: unknown): void {
  window.dispatchEvent(new CustomEvent(name, detail ? { detail } : undefined));
}

/* ── Menu definitions — data-driven, easy to extend ─────────────────────── */

function getMenuDefinitions(): MenuDefinition[] {
  return [
    {
      label: 'File',
      items: [
        { label: 'New File', shortcut: 'Ctrl+N', action: () => dispatchEvent('agent-ide:new-file') },
        { label: 'New Window', shortcut: 'Ctrl+Shift+N', action: () => window.electronAPI?.app?.newWindow?.() },
        SEPARATOR,
        { label: 'Open Folder', shortcut: 'Ctrl+O', action: () => dispatchEvent('menu:open-folder') },
        { label: 'Open File', shortcut: 'Ctrl+P', action: () => dispatchEvent('agent-ide:open-file-picker') },
        SEPARATOR,
        { label: 'Save', shortcut: 'Ctrl+S', action: () => dispatchEvent('agent-ide:save-active-file') },
        { label: 'Save All', shortcut: 'Ctrl+Shift+S', action: () => dispatchEvent(SAVE_ALL_DIRTY_EVENT) },
        SEPARATOR,
        { label: 'Preferences', shortcut: 'Ctrl+,', action: () => dispatchEvent(OPEN_SETTINGS_PANEL_EVENT) },
        SEPARATOR,
        { label: 'Close Tab', shortcut: 'Ctrl+W', action: () => dispatchEvent('agent-ide:close-active-tab') },
        { label: 'Close Window', shortcut: 'Alt+F4', action: () => window.close() },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', shortcut: 'Ctrl+Z', action: () => document.execCommand('undo') },
        { label: 'Redo', shortcut: 'Ctrl+Shift+Z', action: () => document.execCommand('redo') },
        SEPARATOR,
        { label: 'Cut', shortcut: 'Ctrl+X', action: () => document.execCommand('cut') },
        { label: 'Copy', shortcut: 'Ctrl+C', action: () => document.execCommand('copy') },
        { label: 'Paste', shortcut: 'Ctrl+V', action: () => document.execCommand('paste') },
        SEPARATOR,
        { label: 'Find', shortcut: 'Ctrl+F', action: () => dispatchEvent('agent-ide:find') },
        { label: 'Find in Files', shortcut: 'Ctrl+Shift+F', action: () => dispatchEvent('agent-ide:find-in-files') },
        { label: 'Replace', shortcut: 'Ctrl+H', action: () => dispatchEvent('agent-ide:replace') },
        SEPARATOR,
        { label: 'Select All', shortcut: 'Ctrl+A', action: () => document.execCommand('selectAll') },
      ],
    },
    {
      label: 'View',
      items: [
        { label: 'Command Palette', shortcut: 'Ctrl+Shift+P', action: () => dispatchEvent('menu:command-palette') },
        { label: 'File Picker', shortcut: 'Ctrl+P', action: () => dispatchEvent('agent-ide:open-file-picker') },
        SEPARATOR,
        { label: 'Toggle Sidebar', shortcut: 'Ctrl+B', action: () => dispatchEvent('agent-ide:toggle-sidebar') },
        { label: 'Toggle Agent Panel', shortcut: 'Ctrl+\\', action: () => dispatchEvent('agent-ide:toggle-agent-monitor') },
        { label: 'Toggle Terminal', shortcut: 'Ctrl+J', action: () => dispatchEvent('agent-ide:toggle-terminal') },
        SEPARATOR,
        { label: 'Split Editor', shortcut: 'Ctrl+Shift+\\', action: () => dispatchEvent(SPLIT_EDITOR_EVENT) },
        SEPARATOR,
        { label: 'Zoom In', shortcut: 'Ctrl+=', action: () => window.electronAPI?.app?.zoomIn?.() },
        { label: 'Zoom Out', shortcut: 'Ctrl+-', action: () => window.electronAPI?.app?.zoomOut?.() },
        { label: 'Reset Zoom', shortcut: 'Ctrl+0', action: () => window.electronAPI?.app?.zoomReset?.() },
        SEPARATOR,
        { label: 'Toggle Fullscreen', shortcut: 'F11', action: () => window.electronAPI?.app?.toggleFullscreen?.() },
      ],
    },
    {
      label: 'Go',
      items: [
        { label: 'Go to File', shortcut: 'Ctrl+P', action: () => dispatchEvent('agent-ide:open-file-picker') },
        { label: 'Go to Symbol', shortcut: 'Ctrl+Shift+O', action: () => dispatchEvent('agent-ide:go-to-symbol') },
        { label: 'Go to Line', shortcut: 'Ctrl+G', action: () => dispatchEvent('agent-ide:go-to-line') },
        SEPARATOR,
        { label: 'Back', shortcut: 'Alt+Left', action: () => dispatchEvent('agent-ide:navigate-back') },
        { label: 'Forward', shortcut: 'Alt+Right', action: () => dispatchEvent('agent-ide:navigate-forward') },
      ],
    },
    {
      label: 'Terminal',
      items: [
        { label: 'New Terminal', shortcut: 'Ctrl+Shift+`', action: () => dispatchEvent('menu:new-terminal') },
        { label: 'New Claude Terminal', shortcut: 'Ctrl+Shift+C', action: () => dispatchEvent('agent-ide:new-claude-terminal') },
        { label: 'Split Terminal', action: () => dispatchEvent('agent-ide:split-active-terminal') },
        SEPARATOR,
        { label: 'Clear Terminal', action: () => dispatchEvent('agent-ide:clear-active-terminal') },
      ],
    },
    {
      label: 'Help',
      items: [
        { label: 'Documentation', action: () => window.electronAPI?.app?.openExternal?.('https://claude.ai/claude-code') },
        { label: 'Keyboard Shortcuts', shortcut: 'Ctrl+K Ctrl+S', action: () => dispatchEvent('agent-ide:open-keybindings') },
        SEPARATOR,
        { label: 'Open Logs Folder', action: () => window.electronAPI?.app?.openLogsFolder?.() },
        { label: 'Toggle Developer Tools', shortcut: 'Ctrl+Shift+I', action: () => window.electronAPI?.app?.toggleDevTools?.() },
        SEPARATOR,
        { label: 'About Ouroboros', action: () => dispatchEvent('agent-ide:show-about') },
      ],
    },
  ];
}

/* ── Styled menu item row ──────────────────────────────────────────────── */

const menuItemRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  height: '28px',
  padding: '0 12px',
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  fontSize: '12px',
  fontFamily: 'var(--font-ui, sans-serif)',
  color: 'var(--text)',
  transition: 'background-color 80ms ease',
  gap: '16px',
  textAlign: 'left',
  lineHeight: '28px',
  whiteSpace: 'nowrap',
};

const menuItemShortcutStyle: React.CSSProperties = {
  marginLeft: 'auto',
  color: 'var(--text-faint)',
  fontSize: '11px',
  fontFamily: 'var(--font-mono, monospace)',
  letterSpacing: '0.01em',
  flexShrink: 0,
  paddingLeft: '24px',
};

const separatorStyle: React.CSSProperties = {
  height: '1px',
  backgroundColor: 'var(--border-muted)',
  margin: '4px 8px',
};

function MenuItemRow({
  item,
  onClose,
  isHighlighted,
  onMouseEnterItem,
  itemRef,
}: {
  item: MenuItem;
  onClose: () => void;
  isHighlighted: boolean;
  onMouseEnterItem: () => void;
  itemRef: React.Ref<HTMLButtonElement>;
}): React.ReactElement {
  if (item.divider) {
    return <div style={separatorStyle} />;
  }

  return (
    <button
      ref={itemRef}
      onClick={() => { item.action?.(); onClose(); }}
      disabled={item.disabled}
      onMouseEnter={onMouseEnterItem}
      className="titlebar-no-drag"
      style={{
        ...menuItemRowStyle,
        backgroundColor: isHighlighted ? 'var(--accent-muted)' : 'transparent',
        opacity: item.disabled ? 0.4 : 1,
        cursor: item.disabled ? 'default' : 'pointer',
      }}
    >
      <span style={{ flex: 1 }}>{item.label}</span>
      {item.shortcut && (
        <span style={menuItemShortcutStyle}>
          {item.shortcut}
        </span>
      )}
    </button>
  );
}

/* ── Dropdown panel ────────────────────────────────────────────────────── */

const dropdownStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  minWidth: '220px',
  padding: '4px 0',
  backgroundColor: 'var(--bg-secondary)',
  border: '1px solid var(--border-muted)',
  borderRadius: '6px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
  zIndex: 1000,
};

function DropdownMenu({
  menu,
  onClose,
  highlightedIndex,
  onHighlight,
  itemRefs,
}: {
  menu: MenuDefinition;
  onClose: () => void;
  highlightedIndex: number;
  onHighlight: (idx: number) => void;
  itemRefs: React.MutableRefObject<(HTMLButtonElement | null)[]>;
}): React.ReactElement {
  return (
    <div className="titlebar-no-drag" style={dropdownStyle}>
      {menu.items.map((item, i) => (
        <MenuItemRow
          key={item.divider ? `sep-${i}` : item.label}
          item={item}
          onClose={onClose}
          isHighlighted={i === highlightedIndex}
          onMouseEnterItem={() => onHighlight(i)}
          itemRef={(el) => { itemRefs.current[i] = el; }}
        />
      ))}
    </div>
  );
}

/* ── Menu bar trigger button ───────────────────────────────────────────── */

function NavbarMenuButton({
  label,
  isOpen,
  onClick,
  onHover,
  buttonRef,
}: {
  label: string;
  isOpen: boolean;
  onClick: () => void;
  onHover: () => void;
  buttonRef: React.Ref<HTMLButtonElement>;
}): React.ReactElement {
  return (
    <button
      ref={buttonRef}
      className="titlebar-no-drag"
      style={{
        display: 'flex',
        alignItems: 'center',
        height: '100%',
        padding: '0 10px',
        border: 'none',
        background: isOpen ? 'var(--bg-tertiary)' : 'transparent',
        color: isOpen ? 'var(--text)' : 'var(--text-muted)',
        fontSize: '12px',
        fontFamily: 'var(--font-ui, sans-serif)',
        cursor: 'pointer',
        transition: 'color 100ms ease, background-color 100ms ease',
        whiteSpace: 'nowrap',
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        onHover();
        if (!isOpen) {
          e.currentTarget.style.color = 'var(--text)';
          e.currentTarget.style.backgroundColor = 'rgba(128,128,128,0.1)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isOpen) {
          e.currentTarget.style.color = 'var(--text-muted)';
          e.currentTarget.style.backgroundColor = 'transparent';
        }
      }}
    >
      {label}
    </button>
  );
}

/* ── Full navbar menu system with keyboard navigation ──────────────────── */

function NavbarMenus(): React.ReactElement {
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null);
  const [highlightedItem, setHighlightedItem] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menus = getMenuDefinitions();

  const openMenu = openMenuIndex !== null ? menus[openMenuIndex] : null;

  const handleMenuClick = useCallback((idx: number) => {
    setOpenMenuIndex((prev) => {
      if (prev === idx) return null;
      setHighlightedItem(-1);
      return idx;
    });
  }, []);

  const handleMenuHover = useCallback((idx: number) => {
    if (openMenuIndex !== null) {
      setOpenMenuIndex(idx);
      setHighlightedItem(-1);
    }
  }, [openMenuIndex]);

  const handleClose = useCallback(() => {
    setOpenMenuIndex(null);
    setHighlightedItem(-1);
  }, []);

  // Close menus when clicking outside the entire navbar or pressing Escape
  useEffect(() => {
    if (openMenuIndex === null) return;

    function handleClickOutside(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenMenuIndex(null);
        setHighlightedItem(-1);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openMenuIndex]);

  // Keyboard navigation: arrows, enter, escape, alt
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      // Alt key toggles the menu bar (open first menu or close all)
      if (e.key === 'Alt' && !e.ctrlKey && !e.shiftKey) {
        e.preventDefault();
        setOpenMenuIndex((prev) => {
          if (prev !== null) {
            setHighlightedItem(-1);
            return null;
          }
          setHighlightedItem(-1);
          return 0;
        });
        return;
      }

      // Escape closes the menu
      if (e.key === 'Escape') {
        if (openMenuIndex !== null) {
          e.preventDefault();
          setOpenMenuIndex(null);
          setHighlightedItem(-1);
        }
        return;
      }

      // Only handle arrow/enter keys when a menu is open
      if (openMenuIndex === null) return;
      const currentMenu = menus[openMenuIndex];
      if (!currentMenu) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const newIdx = (openMenuIndex - 1 + menus.length) % menus.length;
        setOpenMenuIndex(newIdx);
        setHighlightedItem(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const newIdx = (openMenuIndex + 1) % menus.length;
        setOpenMenuIndex(newIdx);
        setHighlightedItem(-1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        // Move to next non-separator item
        let next = highlightedItem;
        do {
          next = (next + 1) % currentMenu.items.length;
        } while (currentMenu.items[next]?.divider && next !== highlightedItem);
        setHighlightedItem(next);
        itemRefs.current[next]?.scrollIntoView?.({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        let next = highlightedItem;
        do {
          next = (next - 1 + currentMenu.items.length) % currentMenu.items.length;
        } while (currentMenu.items[next]?.divider && next !== highlightedItem);
        setHighlightedItem(next);
        itemRefs.current[next]?.scrollIntoView?.({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = currentMenu.items[highlightedItem];
        if (item && !item.divider && !item.disabled) {
          item.action?.();
          setOpenMenuIndex(null);
          setHighlightedItem(-1);
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openMenuIndex, highlightedItem, menus]);

  return (
    <div ref={containerRef} className="titlebar-no-drag" style={{ display: 'flex', alignItems: 'stretch', height: '100%' }}>
      {menus.map((menu, idx) => (
        <div key={menu.label} style={{ position: 'relative' }}>
          <NavbarMenuButton
            label={menu.label}
            isOpen={openMenuIndex === idx}
            onClick={() => handleMenuClick(idx)}
            onHover={() => handleMenuHover(idx)}
            buttonRef={(el) => { menuButtonRefs.current[idx] = el; }}
          />
          {openMenuIndex === idx && (
            <DropdownMenu
              menu={menu}
              onClose={handleClose}
              highlightedIndex={highlightedItem}
              onHighlight={setHighlightedItem}
              itemRefs={itemRefs}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ── TitleBar ────────────────────────────────────────────────────────────────

export function TitleBar(): React.ReactElement {
  return (
    <div
      className="titlebar-drag flex-shrink-0 flex items-center"
      style={{
        height: 'var(--titlebar-height, 36px)',
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid color-mix(in srgb, var(--border) 50%, transparent)',
      }}
    >
      <TitleBarBranding />
      <NavbarMenus />
      <div className="flex-1 flex items-center justify-center">
        <ContextLayerProgressIndicator />
      </div>
      {TITLE_BAR_ACTIONS.map((action) => (
        <TitleBarActionButton key={action.eventName} {...action} />
      ))}
      <NotificationBell />
      <div style={{ width: 140 }} />
    </div>
  );
}
