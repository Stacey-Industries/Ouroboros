import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useToastContext } from '../../contexts/ToastContext';
import type { WorkspaceLayout, PanelSizes } from '../../types/electron';
import { LayoutSwitcher } from './LayoutSwitcher';
import { LspStatus } from './LspStatus';

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface StatusBarLayoutProps {
  layouts: WorkspaceLayout[];
  activeLayoutName: string;
  currentPanelSizes: PanelSizes;
  currentVisiblePanels: { leftSidebar: boolean; rightSidebar: boolean; terminal: boolean };
  onSelectLayout: (layout: WorkspaceLayout) => void;
  onSaveLayout: (name: string) => void;
  onUpdateLayout: (name: string) => void;
  onDeleteLayout: (name: string) => void;
}

export interface StatusBarProps {
  /** Absolute path to the currently active file */
  activeFilePath?: string | null;
  /** Project root directory — used to compute a relative display path and for git ops */
  projectRoot?: string | null;
  /** Number of lines in the active file */
  lineCount?: number;
  /** Language label derived from the file extension */
  language?: string;
  /** Current git branch name */
  gitBranch?: string | null;
  /** Layout switcher props */
  layout?: StatusBarLayoutProps;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const EXT_TO_LANGUAGE: Record<string, string> = {
  ts: 'TypeScript',
  tsx: 'TypeScript JSX',
  js: 'JavaScript',
  jsx: 'JavaScript JSX',
  json: 'JSON',
  md: 'Markdown',
  css: 'CSS',
  scss: 'SCSS',
  html: 'HTML',
  vue: 'Vue',
  py: 'Python',
  rs: 'Rust',
  go: 'Go',
  java: 'Java',
  c: 'C',
  cpp: 'C++',
  h: 'C Header',
  hpp: 'C++ Header',
  rb: 'Ruby',
  sh: 'Shell',
  bash: 'Bash',
  zsh: 'Zsh',
  yml: 'YAML',
  yaml: 'YAML',
  toml: 'TOML',
  xml: 'XML',
  svg: 'SVG',
  sql: 'SQL',
  graphql: 'GraphQL',
  txt: 'Plain Text',
  log: 'Log',
  env: 'Environment',
  gitignore: 'Git Ignore',
};

function inferLanguage(filePath: string): string {
  const name = filePath.split(/[/\\]/).pop() ?? '';
  // Dotfiles like .gitignore — use the name without the dot
  if (name.startsWith('.') && !name.includes('.', 1)) {
    return EXT_TO_LANGUAGE[name.slice(1)] ?? 'Plain Text';
  }
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  return EXT_TO_LANGUAGE[ext] ?? 'Plain Text';
}

function relativePath(filePath: string, projectRoot: string | null | undefined): string {
  if (!projectRoot) return filePath;
  // Normalise separators for comparison
  const normFile = filePath.replace(/\\/g, '/');
  const normRoot = projectRoot.replace(/\\/g, '/').replace(/\/$/, '');
  if (normFile.startsWith(normRoot + '/')) {
    return normFile.slice(normRoot.length + 1);
  }
  return filePath;
}

// ─── Item sub-component ────────────────────────────────────────────────────────

function StatusItem({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}): React.ReactElement {
  return (
    <span
      className="flex items-center px-2 truncate"
      title={title}
      style={{
        color: 'var(--text-faint)',
        transition: 'color 120ms ease',
        cursor: 'default',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLSpanElement).style.color = 'var(--text-muted)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLSpanElement).style.color = 'var(--text-faint)';
      }}
    >
      {children}
    </span>
  );
}

function Divider(): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      style={{
        width: '1px',
        height: '12px',
        backgroundColor: 'var(--border)',
        flexShrink: 0,
      }}
    />
  );
}

// ─── Icons ──────────────────────────────────────────────────────────────────

function BranchIcon(): React.ReactElement {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M5 3a2 2 0 1 0-4 0 2 2 0 0 0 4 0ZM5 3H4a2 2 0 0 0-2 2v3.17A3.001 3.001 0 0 1 5 11v0a3 3 0 0 0 3-3V5a2 2 0 0 0-2-2H5ZM5 13a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM15 3a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Branch dropdown ─────────────────────────────────────────────────────────

interface BranchDropdownProps {
  projectRoot: string;
  currentBranch: string;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onCheckout: (branch: string) => void;
  checkingOut: string | null;
}

function BranchDropdown({
  projectRoot,
  currentBranch,
  onClose,
  onCheckout,
  checkingOut,
}: BranchDropdownProps): React.ReactElement {
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch branches on mount
  useEffect(() => {
    let active = true;
    window.electronAPI.git.branches(projectRoot).then((result) => {
      if (!active) return;
      if (result.success && result.branches) {
        setBranches(result.branches);
      } else {
        setError(result.error ?? 'Failed to fetch branches');
      }
      setLoading(false);
    }).catch((err: unknown) => {
      if (!active) return;
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    });
    return () => { active = false; };
  }, [projectRoot]);

  // Dismiss on click outside or Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handleMouseDown = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [onClose]);

  const filtered = branches.filter((b) =>
    b.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div
      ref={dropdownRef}
      role="listbox"
      aria-label="Switch branch"
      style={{
        position: 'fixed',
        bottom: '26px', // above status bar (22px) + 4px gap
        left: '0',
        zIndex: 1000,
        minWidth: '220px',
        maxWidth: '320px',
        maxHeight: '280px',
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        boxShadow: '0 -4px 16px rgba(0,0,0,0.4)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: 'var(--font-ui)',
        fontSize: '0.8125rem',
      }}
    >
      {/* Search input */}
      <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-muted)', flexShrink: 0 }}>
        <input
          autoFocus
          type="text"
          placeholder="Filter branches…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            color: 'var(--text)',
            fontSize: '0.75rem',
            fontFamily: 'var(--font-ui)',
            padding: '3px 6px',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Branch list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && (
          <div style={{ padding: '12px', color: 'var(--text-faint)', textAlign: 'center' }}>
            Loading branches…
          </div>
        )}
        {error && (
          <div style={{ padding: '12px', color: 'var(--error)', textAlign: 'center' }}>
            {error}
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div style={{ padding: '12px', color: 'var(--text-faint)', textAlign: 'center' }}>
            No branches match.
          </div>
        )}
        {filtered.map((branch) => {
          const isCurrent = branch === currentBranch;
          const isCheckingOut = checkingOut === branch;
          return (
            <button
              key={branch}
              role="option"
              aria-selected={isCurrent}
              disabled={isCurrent || isCheckingOut || checkingOut !== null}
              onClick={() => { if (!isCurrent) onCheckout(branch); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                width: '100%',
                padding: '5px 10px',
                background: 'none',
                border: 'none',
                cursor: isCurrent ? 'default' : 'pointer',
                textAlign: 'left',
                color: isCurrent ? 'var(--accent)' : 'var(--text)',
                fontFamily: 'var(--font-ui)',
                fontSize: '0.8125rem',
                opacity: checkingOut !== null && !isCheckingOut ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isCurrent && checkingOut === null) {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg)';
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
              }}
            >
              {/* Check mark for current branch */}
              <span style={{ width: '12px', flexShrink: 0 }}>
                {isCurrent ? '✓' : ''}
              </span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {branch}
              </span>
              {isCheckingOut && (
                <span style={{ color: 'var(--text-faint)', fontSize: '0.6875rem', flexShrink: 0 }}>
                  switching…
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── BranchButton — clickable branch pill with dropdown ───────────────────────

function BranchButton({
  gitBranch,
  projectRoot,
}: {
  gitBranch: string;
  projectRoot: string;
}): React.ReactElement {
  const { toast } = useToastContext();
  const [open, setOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleOpen = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  const handleCheckout = useCallback(
    async (branch: string): Promise<void> => {
      setCheckingOut(branch);
      try {
        const result = await window.electronAPI.git.checkout(projectRoot, branch);
        if (result.success) {
          toast(`Switched to branch ${branch}`, 'success');
          setOpen(false);
        } else {
          toast(result.error ?? `Failed to checkout ${branch}`, 'error');
        }
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), 'error');
      } finally {
        setCheckingOut(null);
      }
    },
    [projectRoot, toast],
  );

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <button
        ref={buttonRef}
        onClick={handleOpen}
        title={`Branch: ${gitBranch} — click to switch`}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          background: 'none',
          border: 'none',
          cursor: checkingOut !== null ? 'wait' : 'pointer',
          padding: '0 8px',
          height: '22px',
          color: checkingOut !== null ? 'var(--text-faint)' : 'var(--text-muted)',
          fontFamily: 'var(--font-ui)',
          fontSize: '11px',
          transition: 'color 120ms ease',
        }}
        onMouseEnter={(e) => {
          if (checkingOut === null) {
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)';
          }
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color =
            checkingOut !== null ? 'var(--text-faint)' : 'var(--text-muted)';
        }}
      >
        <BranchIcon />
        <span style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {checkingOut !== null ? `switching…` : gitBranch}
        </span>
        <span style={{ fontSize: '8px', lineHeight: 1, color: 'var(--text-faint)' }}>▲</span>
      </button>

      {open && (
        <BranchDropdown
          projectRoot={projectRoot}
          currentBranch={gitBranch}
          anchorRef={buttonRef}
          onClose={handleClose}
          onCheckout={handleCheckout}
          checkingOut={checkingOut}
        />
      )}
    </div>
  );
}

// ─── StatusBar ─────────────────────────────────────────────────────────────────

export function StatusBar({
  activeFilePath,
  projectRoot,
  lineCount,
  language,
  gitBranch,
  layout,
}: StatusBarProps): React.ReactElement {
  const [layoutOpen, setLayoutOpen] = useState(false);

  const relPath = useMemo(
    () => (activeFilePath ? relativePath(activeFilePath, projectRoot) : null),
    [activeFilePath, projectRoot],
  );

  const displayLanguage = useMemo(
    () => language ?? (activeFilePath ? inferLanguage(activeFilePath) : null),
    [language, activeFilePath],
  );

  return (
    <div
      className="flex items-center justify-between flex-shrink-0 select-none"
      style={{
        height: '22px',
        backgroundColor: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border)',
        fontSize: '11px',
        fontFamily: 'var(--font-ui, system-ui)',
        overflow: 'visible', // allow dropdown to overflow upward
        position: 'relative',
      }}
    >
      {/* ── Left side ── */}
      <div className="flex items-center min-w-0 overflow-hidden">
        {gitBranch && projectRoot ? (
          <>
            <BranchButton gitBranch={gitBranch} projectRoot={projectRoot} />
            <Divider />
          </>
        ) : gitBranch ? (
          <>
            <StatusItem title={`Branch: ${gitBranch}`}>
              <span className="flex items-center gap-1">
                <BranchIcon />
                <span className="truncate max-w-[120px]">{gitBranch}</span>
              </span>
            </StatusItem>
            <Divider />
          </>
        ) : null}
        {relPath ? (
          <>
            <StatusItem title={activeFilePath ?? undefined}>{relPath}</StatusItem>
            {lineCount != null && (
              <>
                <Divider />
                <StatusItem>
                  {lineCount} {lineCount === 1 ? 'line' : 'lines'}
                </StatusItem>
              </>
            )}
            {displayLanguage && (
              <>
                <Divider />
                <StatusItem>{displayLanguage}</StatusItem>
              </>
            )}
          </>
        ) : (
          <StatusItem>No file open</StatusItem>
        )}
      </div>

      {/* ── Right side ── */}
      <div className="flex items-center flex-shrink-0">
        {/* Layout switcher button */}
        {layout && (
          <>
            <button
              onClick={() => setLayoutOpen((prev) => !prev)}
              title={`Layout: ${layout.activeLayoutName}`}
              aria-haspopup="listbox"
              aria-expanded={layoutOpen}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '0 8px',
                height: '22px',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-ui)',
                fontSize: '11px',
                transition: 'color 120ms ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
              }}
            >
              <LayoutIcon />
              <span style={{ maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {layout.activeLayoutName}
              </span>
            </button>
            {layoutOpen && (
              <LayoutSwitcher
                layouts={layout.layouts}
                activeLayoutName={layout.activeLayoutName}
                currentPanelSizes={layout.currentPanelSizes}
                currentVisiblePanels={layout.currentVisiblePanels}
                onSelect={(l) => {
                  layout.onSelectLayout(l);
                  setLayoutOpen(false);
                }}
                onSave={(name) => {
                  layout.onSaveLayout(name);
                }}
                onUpdate={(name) => {
                  layout.onUpdateLayout(name);
                }}
                onDelete={(name) => {
                  layout.onDeleteLayout(name);
                }}
                onClose={() => setLayoutOpen(false)}
              />
            )}
            <Divider />
          </>
        )}
        <LspStatus />
        <Divider />
        <StatusItem>UTF-8</StatusItem>
        <Divider />
        <StatusItem>Ouroboros</StatusItem>
      </div>
    </div>
  );
}

// ─── Layout Icon ────────────────────────────────────────────────────────────────

function LayoutIcon(): React.ReactElement {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <rect x="1" y="1" width="14" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <line x1="6" y1="1" x2="6" y2="11" stroke="currentColor" strokeWidth="1.3" />
      <line x1="1" y1="11" x2="15" y2="11" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
