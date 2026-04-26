import React, { memo } from 'react';

export interface ViewModeBarProps {
  viewMode: 'code' | 'diff' | 'preview';
  setViewMode: (mode: 'code' | 'diff' | 'preview') => void;
  hasDiff: boolean;
  isMarkdown: boolean;
  isHtml: boolean;
}

const containerStyle: React.CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '2px',
  padding: '3px 12px',
  borderBottom: '1px solid var(--border-subtle)',
  backgroundColor: 'var(--surface-panel)',
  userSelect: 'none',
};

function modeButtonStyle(active: boolean, borderRadius: string): React.CSSProperties {
  return {
    padding: '2px 10px',
    fontSize: '0.75rem',
    fontFamily: 'var(--font-ui)',
    fontWeight: 500,
    border: '1px solid',
    borderColor: active ? 'var(--interactive-accent)' : 'var(--border-semantic)',
    borderRadius,
    backgroundColor: active ? 'var(--interactive-accent)' : 'transparent',
    color: active ? 'var(--text-on-accent)' : 'var(--text-muted)',
    cursor: 'pointer',
    lineHeight: '1.5',
  };
}

function canPreview(isMarkdown: boolean, isHtml: boolean): boolean {
  return isMarkdown || isHtml;
}

function codeRadius(hasDiff: boolean, isMarkdown: boolean, isHtml: boolean): string {
  if (hasDiff || canPreview(isMarkdown, isHtml)) return '4px 0 0 4px';
  return '4px';
}

function diffRadius(isMarkdown: boolean, isHtml: boolean): string {
  return canPreview(isMarkdown, isHtml) ? '0' : '0 4px 4px 0';
}

function previewTitle(isMarkdown: boolean): string {
  return isMarkdown ? 'Show markdown preview' : 'Show HTML preview';
}

/**
 * Code / Diff / Preview mode toggle bar.
 * Rendered when diff is available or file supports preview (markdown or HTML).
 */
export const ViewModeBar = memo(function ViewModeBar({
  viewMode,
  setViewMode,
  hasDiff,
  isMarkdown,
  isHtml,
}: ViewModeBarProps): React.ReactElement {
  const showPreview = canPreview(isMarkdown, isHtml);
  return (
    <div style={containerStyle}>
      <button
        onClick={() => setViewMode('code')}
        title="Show code (Ctrl+D to toggle diff)"
        style={modeButtonStyle(viewMode === 'code', codeRadius(hasDiff, isMarkdown, isHtml))}
      >
        Code
      </button>
      {hasDiff && (
        <button
          onClick={() => setViewMode('diff')}
          title="Show diff (Ctrl+D to toggle)"
          style={modeButtonStyle(viewMode === 'diff', diffRadius(isMarkdown, isHtml))}
        >
          Diff
        </button>
      )}
      {showPreview && (
        <button
          onClick={() => setViewMode('preview')}
          title={previewTitle(isMarkdown)}
          style={modeButtonStyle(viewMode === 'preview', '0 4px 4px 0')}
        >
          Preview
        </button>
      )}
    </div>
  );
});
