import type { Ref } from 'react';
import React, { memo } from 'react';

import type { ClaudeMdEditorModel } from './ClaudeMdEditor.model';
import { ClaudeMdOutlineSidebar, ClaudeMdTemplateLibrary } from './ClaudeMdEditor.sidebar';
import { type ClaudeMdStats,formatBytes } from './ClaudeMdEditor.utils';
import { InlineEditor } from './InlineEditor';

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
  borderBottom: '1px solid var(--border-semantic)',
  backgroundColor: 'var(--surface-base)',
  fontFamily: 'var(--font-ui)',
  fontSize: '0.6875rem',
  flexShrink: 0,
};

const buttonStyle: React.CSSProperties = {
  padding: '1px 8px',
  fontSize: '0.6875rem',
  fontFamily: 'var(--font-ui)',
  border: '1px solid var(--border-semantic)',
  borderRadius: '4px',
  backgroundColor: 'transparent',
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
}): React.ReactElement<any> {
  const activeStyle = active ? { borderColor: 'var(--interactive-accent)', backgroundColor: 'var(--interactive-accent)', color: 'var(--text-on-accent)' } : null;
  return (
    <button onClick={onClick} title={title} className="text-text-semantic-muted" style={activeStyle ? { ...buttonStyle, ...activeStyle } : buttonStyle}>
      {children}
    </button>
  );
});

const TokenSummary = memo(function TokenSummary({ stats }: { stats: ClaudeMdStats }): React.ReactElement<any> {
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

const BudgetBadge = memo(function BudgetBadge({ stats }: { stats: ClaudeMdStats }): React.ReactElement<any> {
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
}): React.ReactElement<any> {
  return (
    <div className="text-text-semantic-muted" style={topBarStyle}>
      <span className="text-interactive-accent" style={{ fontWeight: 600 }}>CLAUDE.md Editor</span>
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
}: ClaudeMdEditorChromeProps): React.ReactElement<any> {
  return (
    <div style={frameStyle}>
      <ClaudeMdTopBar onFormat={model.handleFormat} onToggleTemplates={model.toggleTemplates} showTemplates={model.showTemplates} stats={model.stats} />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        <ClaudeMdOutlineSidebar onInsertTemplate={model.handleInsertTemplate} onSelectSection={model.handleScrollToSection} sections={model.sections} />
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <InlineEditor
            ref={model.editorRef as Ref<import('./InlineEditor').InlineEditorHandle>}
            content={content}
            savedContent={model.savedContent}
            filePath={filePath}
            themeId={themeId}
            projectRoot={projectRoot}
            onSave={model.handleSave}
            onContentChange={model.handleContentChange}
            onDirtyChange={() => { }}
          />
        </div>
        {model.showTemplates ? <ClaudeMdTemplateLibrary onInsertTemplate={model.handleInsertTemplate} /> : null}
      </div>
    </div>
  );
});
