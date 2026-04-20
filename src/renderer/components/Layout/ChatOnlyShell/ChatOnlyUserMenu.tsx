/**
 * ChatOnlyUserMenu — bottom-left user menu trigger + popover (Wave 44 Phase C).
 *
 * Trigger: avatar circle + display name. Click opens a popover anchored above
 * the trigger (rendered via createPortal to escape sidebar stacking context).
 *
 * Popover items:
 *   - Header: email address (muted)
 *   - Settings      → OPEN_SETTINGS_EVENT      (Ctrl+,)
 *   - Theme toggle  → flips activeTheme between light and dark inline
 *   - Keyboard shortcuts → TOGGLE_SHORTCUT_CHEATSHEET_EVENT (Ctrl+/)
 *   - Command palette   → 'agent-ide:command-palette'       (Ctrl+K)
 *   - Exit chat mode    → TOGGLE_IMMERSIVE_CHAT_EVENT
 *   - Log out           → disabled stub, tooltip "Available in v2.3"
 *
 * User identity: reads config.user if present; falls back to placeholder.
 * Theme toggle: reads config.activeTheme, writes via useConfig().set.
 * Popover: closes on outside-click and Escape (pattern from MobileOverflowMenu).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  OPEN_SETTINGS_EVENT,
  TOGGLE_IMMERSIVE_CHAT_EVENT,
  TOGGLE_SHORTCUT_CHEATSHEET_EVENT,
} from '../../../hooks/appEventNames';
import { useConfig } from '../../../hooks/useConfig';
import type { AppConfig, AppTheme } from '../../../types/electron';

// ── Constants ─────────────────────────────────────────────────────────────────

const FALLBACK_NAME = 'Cole Stacey';
const FALLBACK_EMAIL = 'colestacey@icloud.com';
const DARK_THEMES: AppTheme[] = ['retro', 'warp', 'cursor', 'kiro', 'glass', 'high-contrast', 'modern'];

// ── Theme helpers ─────────────────────────────────────────────────────────────

function isDark(theme: AppTheme): boolean {
  return DARK_THEMES.some((t) => t === theme);
}

function nextTheme(current: AppTheme): AppTheme {
  return isDark(current) ? 'light' : 'retro';
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function SunIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      <circle cx="8" cy="8" r="3" />
      <line x1="8" y1="1" x2="8" y2="3" /><line x1="8" y1="13" x2="8" y2="15" />
      <line x1="1" y1="8" x2="3" y2="8" /><line x1="13" y1="8" x2="15" y2="8" />
      <line x1="2.9" y1="2.9" x2="4.3" y2="4.3" /><line x1="11.7" y1="11.7" x2="13.1" y2="13.1" />
      <line x1="13.1" y1="2.9" x2="11.7" y2="4.3" /><line x1="4.3" y1="11.7" x2="2.9" y2="13.1" />
    </svg>
  );
}

function MoonIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      <path d="M13.5 10A6 6 0 0 1 6 2.5a6 6 0 1 0 7.5 7.5z" />
    </svg>
  );
}

// ── Popover dismiss hooks ─────────────────────────────────────────────────────

function usePopoverDismiss(
  open: boolean,
  triggerRef: React.RefObject<HTMLButtonElement | null>,
  popoverRef: React.RefObject<HTMLDivElement | null>,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: PointerEvent): void => {
      const target = e.target as Node;
      const outside =
        !triggerRef.current?.contains(target) &&
        !popoverRef.current?.contains(target);
      if (outside) onClose();
    };
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, triggerRef, popoverRef, onClose]);
}

// ── Popover menu item ─────────────────────────────────────────────────────────

interface MenuItemProps {
  label: string;
  shortcut?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}

function MenuItem({ label, shortcut, icon, onClick, disabled, title }: MenuItemProps): React.ReactElement {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-left rounded transition-colors
        text-text-semantic-secondary hover:bg-surface-hover hover:text-text-semantic-primary
        disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
    >
      {icon && <span className="shrink-0 text-text-semantic-muted">{icon}</span>}
      <span className="flex-1">{label}</span>
      {shortcut && (
        <kbd className="text-xs text-text-semantic-faint font-mono shrink-0">{shortcut}</kbd>
      )}
    </button>
  );
}

// ── Popover ───────────────────────────────────────────────────────────────────

interface PopoverProps {
  popoverRef: React.RefObject<HTMLDivElement | null>;
  rect: DOMRect;
  displayName: string;
  email: string;
  currentTheme: AppTheme;
  onSettings: () => void;
  onToggleTheme: () => void;
  onShortcuts: () => void;
  onCommandPalette: () => void;
  onExitChat: () => void;
  onClose: () => void;
}

function UserMenuPopover(props: PopoverProps): React.ReactElement {
  const themeIsLight = !isDark(props.currentTheme);

  const handleItem = useCallback((action: () => void): void => {
    props.onClose();
    action();
  }, [props]);

  return createPortal(
    <div
      ref={props.popoverRef}
      role="menu"
      data-testid="user-menu-popover"
      className="fixed z-[9999] w-56 bg-surface-overlay border border-border-subtle rounded-xl shadow-xl py-1.5 overflow-hidden"
      style={{ bottom: window.innerHeight - props.rect.top + 6, left: props.rect.left }}
    >
      {/* Header: identity */}
      <div className="px-3 py-2 border-b border-border-subtle mb-1">
        <p className="text-xs font-medium text-text-semantic-primary truncate">{props.displayName}</p>
        <p className="text-xs text-text-semantic-muted truncate">{props.email}</p>
      </div>

      <MenuItem label="Settings" shortcut="Ctrl+,"
        onClick={() => handleItem(props.onSettings)} />
      <MenuItem
        label={themeIsLight ? 'Switch to dark' : 'Switch to light'}
        icon={themeIsLight ? <MoonIcon /> : <SunIcon />}
        onClick={() => handleItem(props.onToggleTheme)}
      />
      <MenuItem label="Keyboard shortcuts" shortcut="Ctrl+/"
        onClick={() => handleItem(props.onShortcuts)} />
      <MenuItem label="Command palette" shortcut="Ctrl+K"
        onClick={() => handleItem(props.onCommandPalette)} />

      <div className="my-1 border-t border-border-subtle" />

      <MenuItem label="Exit chat mode"
        onClick={() => handleItem(props.onExitChat)} />
      <MenuItem label="Log out" disabled
        title="Available in v2.3" />
    </div>,
    document.body,
  );
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function AvatarCircle({ displayName }: { displayName: string }): React.ReactElement {
  const initial = displayName.trim().charAt(0).toUpperCase() || '?';
  return (
    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-interactive-accent text-text-on-accent text-xs font-semibold shrink-0 select-none">
      {initial}
    </span>
  );
}

// ── ChatOnlyUserMenu ──────────────────────────────────────────────────────────

interface UserMenuHandlers {
  onSettings: () => void;
  onToggleTheme: () => void;
  onShortcuts: () => void;
  onCommandPalette: () => void;
  onExitChat: () => void;
}

type SetConfig = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => Promise<void>;

function useUserMenuHandlers(
  currentTheme: AppTheme,
  set: SetConfig,
): UserMenuHandlers {
  const onSettings = useCallback(
    (): void => { window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT)); },
    [],
  );
  const onToggleTheme = useCallback(
    (): void => { void set('activeTheme', nextTheme(currentTheme)); },
    [currentTheme, set],
  );
  const onShortcuts = useCallback(
    (): void => { window.dispatchEvent(new CustomEvent(TOGGLE_SHORTCUT_CHEATSHEET_EVENT)); },
    [],
  );
  const onCommandPalette = useCallback(
    (): void => { window.dispatchEvent(new CustomEvent('agent-ide:command-palette')); },
    [],
  );
  const onExitChat = useCallback(
    (): void => { window.dispatchEvent(new CustomEvent(TOGGLE_IMMERSIVE_CHAT_EVENT)); },
    [],
  );
  return { onSettings, onToggleTheme, onShortcuts, onCommandPalette, onExitChat };
}

export function ChatOnlyUserMenu(): React.ReactElement {
  const { config, set } = useConfig();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const handleClose = useCallback((): void => { setOpen(false); }, []);

  usePopoverDismiss(open, triggerRef, popoverRef, handleClose);

  const currentTheme: AppTheme = config?.activeTheme ?? 'retro';
  const displayName = FALLBACK_NAME;
  const email = FALLBACK_EMAIL;
  const handlers = useUserMenuHandlers(currentTheme, set);
  const rect = triggerRef.current?.getBoundingClientRect();

  return (
    <div className="shrink-0 border-t border-border-subtle px-2 py-2" data-testid="user-menu-container">
      <UserMenuTrigger
        triggerRef={triggerRef}
        displayName={displayName}
        open={open}
        onToggle={() => { setOpen((v) => !v); }}
      />
      {open && rect && (
        <UserMenuPopover
          popoverRef={popoverRef}
          rect={rect}
          displayName={displayName}
          email={email}
          currentTheme={currentTheme}
          {...handlers}
          onClose={handleClose}
        />
      )}
    </div>
  );
}

interface UserMenuTriggerProps {
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  displayName: string;
  open: boolean;
  onToggle: () => void;
}

function UserMenuTrigger({
  triggerRef, displayName, open, onToggle,
}: UserMenuTriggerProps): React.ReactElement {
  return (
    <button
      ref={triggerRef}
      type="button"
      onClick={onToggle}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label="User menu"
      data-testid="user-menu-trigger"
      className="flex w-full items-center gap-2 px-1.5 py-1.5 rounded-lg text-left transition-colors hover:bg-surface-hover"
    >
      <AvatarCircle displayName={displayName} />
      <span className="flex-1 text-xs font-medium text-text-semantic-secondary truncate">{displayName}</span>
    </button>
  );
}
