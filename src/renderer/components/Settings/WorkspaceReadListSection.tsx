/**
 * WorkspaceReadListSection.tsx — Settings UI for workspace read-list (Wave 25 Phase E).
 *
 * Shows the always-pinned file list for the current default project root.
 * Files here are auto-pinned as stub PinnedContextItems when a session opens
 * in that project.
 */

import React, { useCallback, useEffect, useState } from 'react';

import type { AppConfig } from '../../types/electron';
import { buttonStyle, SectionLabel } from './settingsStyles';

// ─── Props ────────────────────────────────────────────────────────────────────

interface WorkspaceReadListSectionProps {
  draft: AppConfig;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

function useReadList(projectRoot: string) {
  const [files, setFiles] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!projectRoot) { setFiles([]); return; }
    const result = await window.electronAPI.workspaceReadList.get(projectRoot);
    if (result.success && result.files) setFiles(result.files);
  }, [projectRoot]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!projectRoot) return undefined;
    return window.electronAPI.workspaceReadList.onChanged((payload) => {
      if (payload.projectRoot === projectRoot) setFiles(payload.files);
    });
  }, [projectRoot]);

  const addFile = useCallback(async (filePath: string) => {
    if (!projectRoot) return;
    await window.electronAPI.workspaceReadList.add(projectRoot, filePath);
  }, [projectRoot]);

  const removeFile = useCallback(async (filePath: string) => {
    if (!projectRoot) return;
    await window.electronAPI.workspaceReadList.remove(projectRoot, filePath);
  }, [projectRoot]);

  return { files, addFile, removeFile };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EmptyState(): React.ReactElement {
  return (
    <p className="text-text-semantic-muted" style={emptyStyle}>
      No files pinned. Use the Add button to pick a file.
    </p>
  );
}

function ReadListRow({
  filePath,
  isLast,
  onRemove,
}: {
  filePath: string;
  isLast: boolean;
  onRemove: () => void;
}): React.ReactElement {
  const name = filePath.split(/[\\/]/).pop() ?? filePath;
  return (
    <div style={{ ...rowStyle, borderBottom: isLast ? 'none' : '1px solid var(--border-default)' }}>
      <span className="text-text-semantic-secondary" style={fileNameStyle} title={filePath}>
        {name}
      </span>
      <span className="text-text-semantic-faint" style={filePathStyle} title={filePath}>
        {filePath}
      </span>
      <button
        aria-label={`Remove ${filePath}`}
        onClick={onRemove}
        className="text-text-semantic-muted"
        style={removeBtnStyle}
      >
        ×
      </button>
    </div>
  );
}

function AddFileButton({ onAdd }: { onAdd: (filePath: string) => void }): React.ReactElement {
  async function handleClick(): Promise<void> {
    const result = await window.electronAPI.files.openFile();
    if (!result.cancelled && result.path) onAdd(result.path);
  }
  return (
    <button
      onClick={() => void handleClick()}
      className="text-text-semantic-primary"
      style={buttonStyle}
    >
      Add file…
    </button>
  );
}

// ─── Main section ─────────────────────────────────────────────────────────────

export function WorkspaceReadListSection({ draft }: WorkspaceReadListSectionProps): React.ReactElement {
  const projectRoot = draft.defaultProjectRoot ?? '';
  const { files, addFile, removeFile } = useReadList(projectRoot);

  return (
    <section>
      <div style={headerRowStyle}>
        <SectionLabel style={{ marginBottom: 0 }}>Workspace Read-List</SectionLabel>
        <AddFileButton onAdd={(fp) => void addFile(fp)} />
      </div>
      <p className="text-text-semantic-muted" style={descStyle}>
        Files listed here are automatically pinned to every new session opened in{' '}
        <span className="text-text-semantic-secondary" style={rootLabelStyle}>
          {projectRoot || '(no default project)'}
        </span>
        .
      </p>
      {files.length === 0 ? (
        <EmptyState />
      ) : (
        <div style={listStyle}>
          {files.map((fp, idx) => (
            <ReadListRow
              key={fp}
              filePath={fp}
              isLast={idx === files.length - 1}
              onRemove={() => void removeFile(fp)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const headerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '8px',
};

const descStyle: React.CSSProperties = { fontSize: '12px', marginBottom: '10px' };

const rootLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
};

const emptyStyle: React.CSSProperties = { fontSize: '12px', fontStyle: 'italic' };

const listStyle: React.CSSProperties = {
  border: '1px solid var(--border-default)',
  borderRadius: '6px',
  overflow: 'hidden',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '8px 12px',
  background: 'var(--surface-raised)',
  gap: '8px',
};

const fileNameStyle: React.CSSProperties = {
  fontSize: '12px',
  fontFamily: 'var(--font-mono)',
  flexShrink: 0,
  minWidth: '80px',
};

const filePathStyle: React.CSSProperties = {
  flex: 1,
  fontSize: '11px',
  fontFamily: 'var(--font-mono)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0,
};

const removeBtnStyle: React.CSSProperties = {
  flexShrink: 0,
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: '14px',
  lineHeight: 1,
  padding: '0 2px',
};
