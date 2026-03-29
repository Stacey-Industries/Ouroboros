import React, { useCallback, useEffect, useRef, useState } from 'react';

import { useToastContext } from '../../contexts/ToastContext';
import { ActionIconButton } from './AgentCardControls';
import type { AgentSession } from './types';

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useOutsideClick(
  ref: React.RefObject<HTMLDivElement | null>,
  open: boolean,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!open) return;

    function handleClick(event: MouseEvent): void {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    }

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, onClose, ref]);
}

export function useExportSession(
  session: AgentSession,
  closeMenu: () => void,
): (format: 'json' | 'markdown') => Promise<void> {
  const { toast } = useToastContext();

  return useCallback(
    async (format: 'json' | 'markdown') => {
      closeMenu();
      if (!window.electronAPI?.sessions?.export) {
        toast('Export not available', 'error');
        return;
      }

      try {
        const result = await window.electronAPI.sessions.export(session, format);
        if (!result.success) toast(`Export failed: ${result.error ?? 'unknown error'}`, 'error');
        else if (!result.cancelled)
          toast(`Session exported as ${format === 'json' ? 'JSON' : 'Markdown'}`, 'success');
      } catch {
        toast('Export failed', 'error');
      }
    },
    [closeMenu, session, toast],
  );
}

// ─── ExportMenu ───────────────────────────────────────────────────────────────

function ExportMenuItem({
  label,
  format,
  onExport,
}: {
  label: string;
  format: 'json' | 'markdown';
  onExport: (format: 'json' | 'markdown') => Promise<void>;
}): React.ReactElement<any> {
  return (
    <button
      className="w-full text-left px-3 py-1.5 text-[11px] transition-colors text-text-semantic-primary"
      onMouseEnter={(event) => {
        event.currentTarget.style.background = 'var(--surface-raised)';
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = 'transparent';
      }}
      onClick={() => void onExport(format)}
    >
      {label}
    </button>
  );
}

function ExportMenu({
  onExport,
}: {
  onExport: (format: 'json' | 'markdown') => Promise<void>;
}): React.ReactElement<any> {
  return (
    <div
      className="absolute right-0 z-50 rounded shadow-lg py-0.5 bg-surface-panel border border-border-semantic"
      style={{ top: '100%', marginTop: '2px', minWidth: '130px' }}
    >
      <ExportMenuItem label="Export as JSON" format="json" onExport={onExport} />
      <ExportMenuItem label="Export as Markdown" format="markdown" onExport={onExport} />
    </div>
  );
}

// ─── ExportButton ─────────────────────────────────────────────────────────────

interface ExportButtonProps {
  session: AgentSession;
}

export function ExportButton({ session }: ExportButtonProps): React.ReactElement<any> {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setOpen(false), []);
  const handleExport = useExportSession(session, closeMenu);

  useOutsideClick(menuRef, open, closeMenu);

  return (
    <div className="relative shrink-0" ref={menuRef}>
      <ActionIconButton
        title="Export session"
        ariaLabel="Export session"
        color="var(--text-faint)"
        hoverColor="var(--text-primary)"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
          <path
            d="M5 1v5M2.5 4L5 6.5 7.5 4M1.5 8.5h7"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </ActionIconButton>
      {open && <ExportMenu onExport={handleExport} />}
    </div>
  );
}
