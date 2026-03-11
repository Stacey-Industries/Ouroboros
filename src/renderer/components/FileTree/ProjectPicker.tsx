import React, { useState, useRef, useEffect } from 'react';

export interface ProjectPickerProps {
  currentPath: string | null;
  recentProjects: string[];
  onSelectProject: (path: string) => void;
  /** Called to add a folder to the workspace without replacing existing roots. */
  onAddProject?: (path: string) => void;
  /** Number of currently open roots (to show "Add to workspace" option). */
  rootCount?: number;
}

function basename(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? filePath;
}

function FolderIcon(): React.ReactElement {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 13 13"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M1.5 3.5C1.5 2.948 1.948 2.5 2.5 2.5H5L6.5 4H10.5C11.052 4 11.5 4.448 11.5 5V9.5C11.5 10.052 11.052 10.5 10.5 10.5H2.5C1.948 10.5 1.5 10.052 1.5 9.5V3.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronDownIcon(): React.ReactElement {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M2 4L5 7L8 4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIcon(): React.ReactElement {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 13 13"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M6.5 2.5V10.5M2.5 6.5H10.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

const BUTTON_BASE_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  width: '100%',
  padding: '8px 12px',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontSize: '0.8125rem',
  fontFamily: 'var(--font-ui)',
  textAlign: 'left' as const,
};

/**
 * ProjectPicker — shows the current project name and a dropdown of recent projects.
 * When roots already exist, an "Add folder to workspace" option is shown alongside
 * the standard "Open folder…" (which replaces all roots).
 */
export function ProjectPicker({
  currentPath,
  recentProjects,
  onSelectProject,
  onAddProject,
  rootCount = 0,
}: ProjectPickerProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  async function handleOpenFolder() {
    setOpen(false);
    setBusy(true);
    try {
      const result = await window.electronAPI.files.selectFolder();
      if (!result.cancelled && result.path) {
        onSelectProject(result.path);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleAddFolder() {
    setOpen(false);
    setBusy(true);
    try {
      const result = await window.electronAPI.files.selectFolder();
      if (!result.cancelled && result.path) {
        if (onAddProject) {
          onAddProject(result.path);
        } else {
          onSelectProject(result.path);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  const projectName = currentPath ? basename(currentPath) : 'Open a folder…';
  const hasMultipleRoots = rootCount > 1;

  // Deduplicate recent projects, excluding the current one
  const recents = [...new Set(recentProjects)].filter((p) => p !== currentPath).slice(0, 8);

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        disabled={busy}
        title={currentPath ?? 'No folder open'}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          width: '100%',
          padding: '0 4px',
          background: 'transparent',
          border: 'none',
          color: busy ? 'var(--text-faint)' : 'var(--text)',
          cursor: busy ? 'wait' : 'pointer',
          fontSize: '0.8125rem',
          fontFamily: 'var(--font-ui)',
          fontWeight: 500,
          overflow: 'hidden',
          minWidth: 0,
        }}
      >
        <span style={{ color: 'var(--text-muted)' }}>
          <FolderIcon />
        </span>
        <span
          style={{
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            textAlign: 'left',
          }}
        >
          {hasMultipleRoots ? `Workspace (${rootCount})` : projectName}
        </span>
        <span style={{ color: 'var(--text-muted)' }}>
          <ChevronDownIcon />
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Project selector"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 1000,
            backgroundColor: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            overflow: 'hidden',
            marginTop: '4px',
          }}
        >
          {/* Open folder action — replaces all roots */}
          <button
            role="option"
            aria-selected={false}
            onClick={() => void handleOpenFolder()}
            style={{
              ...BUTTON_BASE_STYLE,
              borderBottom: '1px solid var(--border-muted)',
              color: 'var(--accent)',
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(88, 166, 255, 0.1)')
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent')
            }
          >
            <FolderIcon />
            {rootCount > 0 ? 'Open folder… (replace workspace)' : 'Open folder…'}
          </button>

          {/* Add folder to workspace — only when roots exist and handler provided */}
          {rootCount > 0 && onAddProject && (
            <button
              role="option"
              aria-selected={false}
              onClick={() => void handleAddFolder()}
              style={{
                ...BUTTON_BASE_STYLE,
                borderBottom: '1px solid var(--border-muted)',
                color: 'var(--accent)',
              }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(88, 166, 255, 0.1)')
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent')
              }
            >
              <PlusIcon />
              Add folder to workspace…
            </button>
          )}

          {/* Recent projects */}
          {recents.length > 0 && (
            <div>
              <div
                style={{
                  padding: '4px 12px 2px',
                  fontSize: '0.6875rem',
                  color: 'var(--text-faint)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                Recent
              </div>
              {recents.map((p) => (
                <button
                  key={p}
                  role="option"
                  aria-selected={false}
                  onClick={() => {
                    onSelectProject(p);
                    setOpen(false);
                  }}
                  title={p}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    width: '100%',
                    padding: '6px 12px',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text)',
                    cursor: 'pointer',
                    fontSize: '0.8125rem',
                    fontFamily: 'var(--font-ui)',
                    textAlign: 'left',
                    overflow: 'hidden',
                  }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-secondary)')
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent')
                  }
                >
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      width: '100%',
                    }}
                  >
                    {basename(p)}
                  </span>
                  <span
                    style={{
                      fontSize: '0.6875rem',
                      color: 'var(--text-faint)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      width: '100%',
                    }}
                  >
                    {p}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
