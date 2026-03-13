import React, { memo } from 'react';
import { InlineEditor } from './InlineEditor';
import type { ClaudeMdEditorModel } from './ClaudeMdEditor.model';
import { formatBytes, type ClaudeMdStats } from './ClaudeMdEditor.utils';
import { ClaudeMdOutlineSidebar, ClaudeMdTemplateLibrary } from './ClaudeMdEditor.sidebar';

interface ClaudeMdEditorChromeProps {
  content: string;
  filePath: string;
  model: ClaudeMdEditorModel;
  projectRoot?: string | null;
  themeId: string;
}

const frameStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
};

const topBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '4px 12px',
  borderBottom: '1px solid var(--border)',
  backgroundColor: 'var(--bg)',
  fontFamily: 'var(--font-ui)',
  fontSize: '0.6875rem',
  color: 'var(--text-muted)',
  flexShrink: 0,
};

const buttonStyle: React.CSSProperties = {
  padding: '1px 8px',
  fontSize: '0.6875rem',
  fontFamily: 'var(--font-ui)',
  border: '1px solid var(--border)',
  borderRadius: '4px',
  backgroundColor: 'transparent',
  color: 'var(--text-muted)',
  cursor: 'pointer',
};

const ActionButton = memo(function ActionButton({
  active = false,
  children,
  onClick,
  title,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}): React.ReactElement {
  const activeStyle = active ? { borderColor: 'var(--accent)', backgroundColor: 'var(--accent)', color: 'var(--bg)' } : null;
  return (
    <button onClick={onClick} title={title} style={activeStyle ? { ...buttonStyle, ...activeStyle } : buttonStyle}>
      {children}
    </button>
  );
});

const TokenSummary = memo(function TokenSummary({ stats }: { stats: ClaudeMdStats }): React.ReactElement {
  return (
    <span title="Estimated token count (~4 chars/token)">
      <span
        style={{
          display: 'inline-block',
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: stats.tone.color,
          marginRight: '4px',
        }}
      />
      {stats.tokens.toLocaleString()} tokens
    </span>
  );
});

const BudgetBadge = memo(function BudgetBadge({ stats }: { stats: ClaudeMdStats }): React.ReactElement {
  return (
    <span
      title="Token budget: CLAUDE.md typically uses 1-5K of ~200K context"
      style={{ padding: '1px 6px', borderRadius: '3px', backgroundColor: stats.tone.backgroundColor, color: stats.tone.color }}
    >
      {stats.tone.label}
    </span>
  );
});

const ClaudeMdTopBar = memo(function ClaudeMdTopBar({
  onFormat,
  onToggleTemplates,
  showTemplates,
  stats,
}: {
  onFormat: () => void;
  onToggleTemplates: () => void;
  showTemplates: boolean;
  stats: ClaudeMdStats;
}): React.ReactElement {
  return (
    <div style={topBarStyle}>
      <span style={{ fontWeight: 600, color: 'var(--accent)' }}>CLAUDE.md Editor</span>
      <span style={{ marginLeft: 'auto' }} />
      <TokenSummary stats={stats} />
      <span title="File size on disk">{formatBytes(stats.fileSize)}</span>
      <BudgetBadge stats={stats} />
      <ActionButton onClick={onFormat} title="Normalize headings and whitespace">Format</ActionButton>
      <ActionButton active={showTemplates} onClick={onToggleTemplates} title="Toggle template library">Templates</ActionButton>
    </div>
  );
});

export const ClaudeMdEditorChrome = memo(function ClaudeMdEditorChrome({
  content,
  filePath,
  model,
  projectRoot,
  themeId,
}: ClaudeMdEditorChromeProps): React.ReactElement {
  return (
    <div style={frameStyle}>
      <ClaudeMdTopBar onFormat={model.handleFormat} onToggleTemplates={model.toggleTemplates} showTemplates={model.showTemplates} stats={model.stats} />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        <ClaudeMdOutlineSidebar onInsertTemplate={model.handleInsertTemplate} onSelectSection={model.handleScrollToSection} sections={model.sections} />
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <InlineEditor
            ref={model.editorRef}
            content={content}
            filePath={filePath}
            themeId={themeId}
            projectRoot={projectRoot}
            onSave={model.handleSave}
            onDirtyChange={model.handleDirtyChange}
          />
        </div>
        {model.showTemplates ? <ClaudeMdTemplateLibrary onInsertTemplate={model.handleInsertTemplate} /> : null}
      </div>
    </div>
  );
});
