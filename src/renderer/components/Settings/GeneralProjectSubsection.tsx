/**
 * GeneralProjectSubsection.tsx — Default project folder & recent projects.
 */

import React from 'react';
import type { AppConfig } from '../../types/electron';
import { SectionLabel, buttonStyle } from './settingsStyles';

interface Props {
  draft: AppConfig;
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
}

export function DefaultProjectFolder({ draft, onChange }: Props): React.ReactElement {
  async function handlePickFolder(): Promise<void> {
    const result = await window.electronAPI.files.selectFolder();
    if (!result.cancelled && result.path) {
      onChange('defaultProjectRoot', result.path);
    }
  }

  const defaultRoot = draft.defaultProjectRoot ?? '';

  return (
    <section>
      <SectionLabel>Default Project Folder</SectionLabel>
      <p style={descStyle}>
        The folder Ouroboros opens by default when no project is loaded.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={pathDisplayStyle(defaultRoot)} title={defaultRoot || 'Not set'}>
          {defaultRoot || 'Not set'}
        </div>
        <button onClick={() => void handlePickFolder()} style={buttonStyle}>
          Browse...
        </button>
      </div>
    </section>
  );
}

export function RecentProjects({ draft, onChange }: Props): React.ReactElement {
  const recentProjects = draft.recentProjects ?? [];

  return (
    <section>
      <div style={headerRowStyle}>
        <SectionLabel style={{ marginBottom: 0 }}>Recent Projects</SectionLabel>
        {recentProjects.length > 0 && (
          <button onClick={() => onChange('recentProjects', [])} style={clearBtnStyle}>
            Clear all
          </button>
        )}
      </div>
      {recentProjects.length === 0 ? (
        <p style={emptyStyle}>No recent projects.</p>
      ) : (
        <RecentProjectList projects={recentProjects} onChange={onChange} />
      )}
    </section>
  );
}

function RecentProjectList({ projects, onChange }: {
  projects: string[];
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
}): React.ReactElement {
  return (
    <div style={listBorderStyle}>
      {projects.map((project, idx) => (
        <RecentProjectRow
          key={project}
          project={project}
          index={idx}
          isLast={idx === projects.length - 1}
          onRemove={() => onChange('recentProjects', projects.filter((p) => p !== project))}
        />
      ))}
    </div>
  );
}

function RecentProjectRow({ project, index, isLast, onRemove }: {
  project: string; index: number; isLast: boolean; onRemove: () => void;
}): React.ReactElement {
  return (
    <div style={{ ...rowStyle, borderBottom: isLast ? 'none' : '1px solid var(--border)' }}>
      <span style={indexStyle}>{index + 1}</span>
      <span style={pathStyle} title={project}>{project}</span>
      <button aria-label={`Remove ${project}`} onClick={onRemove} style={removeBtnStyle}>×</button>
    </div>
  );
}

const descStyle: React.CSSProperties = { fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' };
const headerRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' };
const emptyStyle: React.CSSProperties = { fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' };
const listBorderStyle: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' };
const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-tertiary)', gap: '8px' };
const indexStyle: React.CSSProperties = { fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', flexShrink: 0 };
const pathStyle: React.CSSProperties = { flex: 1, fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 };
const removeBtnStyle: React.CSSProperties = { flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1, padding: '0 2px' };

const clearBtnStyle: React.CSSProperties = {
  flexShrink: 0, padding: '4px 8px', borderRadius: '6px',
  border: '1px solid var(--error)', background: 'transparent',
  color: 'var(--error)', fontSize: '11px', cursor: 'pointer', whiteSpace: 'nowrap',
};

function pathDisplayStyle(value: string): React.CSSProperties {
  return {
    flex: 1, padding: '7px 10px', borderRadius: '6px',
    border: '1px solid var(--border)', background: 'var(--bg-tertiary)',
    fontSize: '12px', fontFamily: 'var(--font-mono)',
    color: value ? 'var(--text-secondary)' : 'var(--text-muted)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
  };
}
