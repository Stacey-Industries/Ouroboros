import React, { useCallback, useEffect, useRef, useState } from 'react';

import type { DirEntry } from '../../types/electron';
import {
  REQUEST_FOLDER_SELECTION_EVENT,
  resolveFolderSelection,
} from './WebFolderBrowserSupport';

// ─── Types ─────────────────────────────────────────────────────────────────

interface BrowserState {
  isOpen: boolean;
  currentPath: string;
  entries: DirEntry[];
  loading: boolean;
  error: string | null;
}

const INITIAL_STATE: BrowserState = {
  isOpen: false,
  currentPath: '/',
  entries: [],
  loading: false,
  error: null,
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function buildBreadcrumbs(path: string): { label: string; path: string }[] {
  if (path === '/') return [{ label: '/', path: '/' }];
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
  return [
    { label: '/', path: '/' },
    ...parts.map((part, i) => ({
      label: part,
      path: '/' + parts.slice(0, i + 1).join('/'),
    })),
  ];
}

function parentPath(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/$/, '');
  const idx = normalized.lastIndexOf('/');
  return idx <= 0 ? '/' : normalized.slice(0, idx);
}

// ─── Sub-components ────────────────────────────────────────────────────────

interface BreadcrumbsProps {
  path: string;
  onNavigate: (path: string) => void;
}

function Breadcrumbs({ path, onNavigate }: BreadcrumbsProps): React.ReactElement<any> {
  const crumbs = buildBreadcrumbs(path);
  return (
    <div
      className="flex items-center gap-1 text-text-semantic-muted overflow-x-auto"
      style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', padding: '6px 14px 0' }}
    >
      {crumbs.map((crumb, i) => (
        <React.Fragment key={crumb.path}>
          {i > 0 && <span className="text-text-semantic-faint">/</span>}
          <button
            onClick={() => onNavigate(crumb.path)}
            className="text-text-semantic-secondary hover:text-text-semantic-primary transition-colors truncate max-w-[120px]"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 3px' }}
            title={crumb.path}
          >
            {crumb.label}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}

interface DirListProps {
  entries: DirEntry[];
  onEnter: (path: string) => void;
}

function DirList({ entries, onEnter }: DirListProps): React.ReactElement<any> {
  const dirs = entries.filter((e) => e.isDirectory);
  if (dirs.length === 0) {
    return (
      <div
        className="text-text-semantic-faint flex items-center justify-center"
        style={{ height: '80px', fontSize: '13px' }}
      >
        No subdirectories
      </div>
    );
  }
  return (
    <ul role="listbox" style={{ listStyle: 'none', margin: 0, padding: '4px 0' }}>
      {dirs.map((entry) => (
        <li key={entry.path}>
          <button
            role="option"
            onClick={() => onEnter(entry.path)}
            className="w-full text-left flex items-center gap-2 text-text-semantic-primary hover:bg-interactive-muted transition-colors"
            style={{ padding: '6px 14px', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <span className="text-interactive-accent" style={{ fontSize: '14px' }}>{'\u{1F4C1}'}</span>
            <span style={{ fontSize: '13px', fontFamily: 'var(--font-ui)' }}>{entry.name}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

interface ConfirmButtonsProps {
  loading: boolean;
  onSelect: () => void;
  onCancel: () => void;
}

function ConfirmButtons({ loading, onSelect, onCancel }: ConfirmButtonsProps): React.ReactElement<any> {
  return (
    <div className="flex gap-2">
      <button
        onClick={onCancel}
        className="text-text-semantic-secondary hover:text-text-semantic-primary border border-border-semantic transition-colors"
        style={{ background: 'none', cursor: 'pointer', padding: '5px 12px', borderRadius: '5px', fontSize: '13px' }}
      >
        Cancel
      </button>
      <button
        onClick={onSelect}
        disabled={loading}
        className="bg-interactive-accent text-text-semantic-on-accent hover:bg-interactive-hover disabled:opacity-50 transition-colors"
        style={{ cursor: loading ? 'default' : 'pointer', padding: '5px 14px', borderRadius: '5px', fontSize: '13px', border: 'none' }}
      >
        Select This Folder
      </button>
    </div>
  );
}

interface ModalActionsProps {
  currentPath: string;
  loading: boolean;
  onSelect: () => void;
  onCancel: () => void;
  onUp: () => void;
}

function ModalActions({ currentPath, loading, onSelect, onCancel, onUp }: ModalActionsProps): React.ReactElement<any> {
  const isRoot = currentPath === '/';
  return (
    <div
      className="flex items-center justify-between border-t border-border-semantic"
      style={{ padding: '8px 14px', gap: '8px' }}
    >
      <button
        onClick={onUp}
        disabled={isRoot || loading}
        className="text-text-semantic-secondary hover:text-text-semantic-primary disabled:opacity-40 transition-colors"
        style={{ background: 'none', border: 'none', cursor: isRoot ? 'default' : 'pointer', fontSize: '12px' }}
      >
        Up
      </button>
      <ConfirmButtons loading={loading} onSelect={onSelect} onCancel={onCancel} />
    </div>
  );
}

// ─── Hook ──────────────────────────────────────────────────────────────────

function useWebFolderBrowser() {
  const [state, setState] = useState<BrowserState>(INITIAL_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  const navigate = useCallback(async (path: string) => {
    setState((s) => ({ ...s, currentPath: path, loading: true, error: null }));
    try {
      const result = await window.electronAPI.files.readDir(path);
      if (!result.success) {
        setState((s) => ({ ...s, loading: false, error: result.error ?? 'Failed to read directory' }));
        return;
      }
      setState((s) => ({ ...s, loading: false, entries: result.items ?? [] }));
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: String(err) }));
    }
  }, []);

  const open = useCallback(() => {
    setState((s) => ({ ...s, isOpen: true }));
    void navigate(stateRef.current.currentPath);
  }, [navigate]);

  const cancel = useCallback(() => {
    setState((s) => ({ ...s, isOpen: false }));
    resolveFolderSelection({ cancelled: true, path: null });
  }, []);

  const select = useCallback(() => {
    const path = stateRef.current.currentPath;
    setState((s) => ({ ...s, isOpen: false }));
    resolveFolderSelection({ cancelled: false, path });
  }, []);

  return { state, open, cancel, select, navigate };
}

// ─── Modal Header + Body ───────────────────────────────────────────────────

function ModalHeader({ currentPath, onNavigate }: { currentPath: string; onNavigate: (p: string) => void }): React.ReactElement<any> {
  return (
    <div className="border-b border-border-semantic" style={{ padding: '12px 14px 8px' }}>
      <div className="text-text-semantic-primary" style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>
        Select Folder
      </div>
      <Breadcrumbs path={currentPath} onNavigate={onNavigate} />
    </div>
  );
}

function ModalBody({ state, onEnter }: { state: BrowserState; onEnter: (p: string) => void }): React.ReactElement<any> {
  if (state.loading) {
    return (
      <div className="text-text-semantic-muted flex items-center justify-center flex-1" style={{ height: '120px', fontSize: '13px' }}>
        Loading...
      </div>
    );
  }
  if (state.error) {
    return (
      <div className="text-status-error flex items-center justify-center flex-1" style={{ height: '80px', fontSize: '13px', padding: '0 14px', textAlign: 'center' }}>
        {state.error}
      </div>
    );
  }
  return (
    <div className="overflow-y-auto flex-1" style={{ minHeight: '120px', maxHeight: '320px' }}>
      <DirList entries={state.entries} onEnter={onEnter} />
    </div>
  );
}

// ─── Modal Panel ───────────────────────────────────────────────────────────

interface ModalPanelProps {
  state: BrowserState;
  onNavigate: (path: string) => void;
  onSelect: () => void;
  onCancel: () => void;
}

function ModalPanel({ state, onNavigate, onSelect, onCancel }: ModalPanelProps): React.ReactElement<any> {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="bg-surface-panel border border-border-semantic"
      style={{
        width: '100%',
        maxWidth: '500px',
        borderRadius: '8px',
        overflow: 'hidden',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '70vh',
      }}
    >
      <ModalHeader currentPath={state.currentPath} onNavigate={onNavigate} />
      <ModalBody state={state} onEnter={onNavigate} />
      <ModalActions
        currentPath={state.currentPath}
        loading={state.loading}
        onSelect={onSelect}
        onCancel={onCancel}
        onUp={() => onNavigate(parentPath(state.currentPath))}
      />
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export function WebFolderBrowser(): React.ReactElement<any> | null {
  const { state, open, cancel, select, navigate } = useWebFolderBrowser();

  useEffect(() => {
    const handler = () => open();
    window.addEventListener(REQUEST_FOLDER_SELECTION_EVENT, handler);
    return () => window.removeEventListener(REQUEST_FOLDER_SELECTION_EVENT, handler);
  }, [open]);

  useEffect(() => {
    if (!state.isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel();
      if (e.key === 'Enter') select();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state.isOpen, cancel, select]);

  if (!state.isOpen) return null;

  return (
    <div
      aria-modal="true"
      role="dialog"
      aria-label="Select Folder"
      onClick={cancel}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)', padding: '16px' }}
    >
      <ModalPanel state={state} onNavigate={navigate} onSelect={select} onCancel={cancel} />
    </div>
  );
}
