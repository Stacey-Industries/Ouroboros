import React, { memo } from 'react';

export interface ViewModeBarProps {
  viewMode: 'code' | 'diff' | 'preview';
  setViewMode: (mode: 'code' | 'diff' | 'preview') => void;
  hasDiff: boolean;
  isMarkdown: boolean;
}

const containerStyle: React.CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '2px',
  padding: '3px 12px',
  borderBottom: '1px solid var(--border-muted)',
  backgroundColor: 'var(--surface-panel)',
  userSelect: 'none',
};

function modeButtonStyle(
  active: boolean,
  borderRadius: string
): React.CSSProperties {
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

function codeRadius(hasDiff: boolean, isMarkdown: boolean): string {
  if (hasDiff || isMarkdown) return '4px 0 0 4px';
  return '4px';
}

function diffRadius(isMarkdown: boolean): string {
  return isMarkdown ? '0' : '0 4px 4px 0';
}

/**
 * Code / Diff / Preview mode toggle bar.
 * Only rendered when diff is available or file is markdown.
 */
export const ViewModeBar = memo(function ViewModeBar({
  viewMode,
  setViewMode,
  hasDiff,
  isMarkdown,
}: ViewModeBarProps): React.ReactElement {
  return (
    <div style={containerStyle}>
      <button
        onClick={() => setViewMode('code')}
        title="Show code (Ctrl+D to toggle diff)"
        style={modeButtonStyle(viewMode === 'code', codeRadius(hasDiff, isMarkdown))}
      >
        Code
      </button>
      {hasDiff && (
        <button
          onClick={() => setViewMode('diff')}
          title="Show diff (Ctrl+D to toggle)"
          style={modeButtonStyle(viewMode === 'diff', diffRadius(isMarkdown))}
        >
          Diff
        </button>
      )}
      {isMarkdown && (
        <button
          onClick={() => setViewMode('preview')}
          title="Show markdown preview"
          style={modeButtonStyle(viewMode === 'preview', '0 4px 4px 0')}
        >
          Preview
        </button>
      )}
    </div>
  );
});
