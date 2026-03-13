import React, { memo } from 'react';
import { getFileIcon } from '../FileTree/fileIcons';

export interface StatusBarProps {
  filePath: string;
  lineCount: number;
  collapsedFoldCount: number;
  highlightLang: string | null;
}

const containerStyle: React.CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '2px 12px',
  borderTop: '1px solid var(--border-muted)',
  backgroundColor: 'var(--bg-secondary)',
  fontSize: '0.6875rem',
  color: 'var(--text-faint)',
  userSelect: 'none',
};

/**
 * Bottom status bar showing line count, fold count, language, and encoding.
 */
export const StatusBar = memo(function StatusBar({
  filePath,
  lineCount,
  collapsedFoldCount,
  highlightLang,
}: StatusBarProps): React.ReactElement {
  return (
    <div style={containerStyle}>
      <span>{lineCount} lines</span>
      {collapsedFoldCount > 0 && (
        <span style={{ color: 'var(--text-muted)' }}>
          {collapsedFoldCount} folded
        </span>
      )}
      {highlightLang && (
        <span style={{ color: getFileIcon(filePath).color }}>
          {highlightLang}
        </span>
      )}
      <span>UTF-8</span>
    </div>
  );
});
