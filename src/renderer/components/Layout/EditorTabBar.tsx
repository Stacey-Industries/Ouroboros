/**
 * EditorTabBar — renders file tabs and multi-buffer tabs in the centre pane header.
 *
 * Extracted from App.tsx. Reads open files from FileViewerManager context
 * and multi-buffers from MultiBufferManager context.
 * Passed as the `editorTabBar` slot of AppLayout / CentrePane.
 *
 * Sub-modules:
 *   EditorTabBar.styles.ts — style constants
 *   EditorTabBar.tabs.tsx  — MultiBufferTabItem, MultiBufferTabs, FileTabsRow, hooks
 */

import React, { useState } from 'react';

import { useFileViewerManager } from '../FileViewer';
import { useMultiBufferManager } from '../FileViewer/MultiBufferManager';
import {
  containerStyle,
  spacerStyle,
  specialViewCloseStyle,
  specialViewIconStyle,
  specialViewTabActiveStyle,
  specialViewTabStyle,
  splitButtonActiveStyle,
  splitButtonStyle,
} from './EditorTabBar.styles';
import {
  activateMultiBuffer,
  deactivateMultiBuffer,
  FileTabsRow,
  MultiBufferTabs,
  NewMultiBufferButton,
  useActiveMultiBufferId,
  useEditorTabActions,
} from './EditorTabBar.tabs';

// ── Types ─────────────────────────────────────────────────────────────────────

type SpecialViewType = 'settings' | 'usage' | 'context-builder' | 'time-travel' | 'extensions' | 'mcp' | 'usage-dashboard' | 'graph-panel';

export type { SpecialViewType };

export interface EditorTabBarProps {
  openSpecialViews: SpecialViewType[];
  activeSpecialView: SpecialViewType | null;
  onSpecialViewClick: (view: SpecialViewType) => void;
  onSpecialViewClose: (view: SpecialViewType) => void;
}

// ── SpecialViewTab ────────────────────────────────────────────────────────────

const SPECIAL_VIEW_META: Record<SpecialViewType, { label: string; icon: string }> = {
  'settings': { label: 'Settings', icon: '\u2699' },
  'usage': { label: 'Usage', icon: '\u2630' },
  'context-builder': { label: 'Context', icon: '\u2631' },
  'time-travel': { label: 'Time Travel', icon: '\u21B7' },
  'extensions': { label: 'Extensions', icon: '\u2B29' },
  'mcp': { label: 'MCP Servers', icon: '\u2B21' },
  'usage-dashboard': { label: 'Usage Dashboard', icon: '\u25A4' },
  'graph-panel': { label: 'Graph', icon: '\u29C0' },
};

function SpecialViewTab({ specialView, isActive, onClick, onClose }: {
  specialView: SpecialViewType; isActive: boolean; onClick: () => void; onClose?: () => void;
}): React.ReactElement {
  const meta = SPECIAL_VIEW_META[specialView];
  if (!meta) return <></>;
  return (
    <div role="tab" tabIndex={0} aria-selected={isActive} title={meta.label} onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
      style={isActive ? specialViewTabActiveStyle : specialViewTabStyle}
    >
      <span style={specialViewIconStyle}>{meta.icon}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta.label}</span>
      {onClose && (
        <button onClick={(e) => { e.stopPropagation(); onClose(); }}
          aria-label={`Close ${meta.label}`} style={specialViewCloseStyle}>
          ×
        </button>
      )}
    </div>
  );
}

// ── SplitEditorButton ─────────────────────────────────────────────────────────

function SplitColumnsIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="1" y="2" width="14" height="12" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <line x1="8" y1="2" x2="8" y2="14" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function SplitEditorButton({ isSplit, onSplit, onCloseSplit }: {
  isSplit: boolean; onSplit: () => void; onCloseSplit: () => void;
}): React.ReactElement {
  const [isHovered, setIsHovered] = useState(false);
  const accentColor = 'var(--interactive-accent)';
  const faintColor = 'var(--text-faint, var(--text-secondary))';
  return (
    <button onClick={isSplit ? onCloseSplit : onSplit}
      onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}
      title={isSplit ? 'Close Split Editor' : 'Split Editor Right'}
      aria-label={isSplit ? 'Close Split Editor' : 'Split Editor Right'}
      style={{
        ...(isSplit ? splitButtonActiveStyle : splitButtonStyle),
        color: isHovered || isSplit ? accentColor : faintColor,
        backgroundColor: isHovered ? 'var(--surface-raised)' : 'transparent',
      }}
    >
      <SplitColumnsIcon />
    </button>
  );
}

// ── EditorTabBar ──────────────────────────────────────────────────────────────

export function EditorTabBar({ openSpecialViews, activeSpecialView, onSpecialViewClick, onSpecialViewClose }: EditorTabBarProps): React.ReactElement {
  const {
    openFiles, activeIndex, setActive, closeFile,
    pinTab, unpinTab, togglePin, closeOthers, closeToRight, closeAll,
    split, splitRight, closeSplit,
  } = useFileViewerManager();
  const { multiBuffers, openMultiBuffer, closeMultiBuffer, renameMultiBuffer } = useMultiBufferManager();
  const { handleNewMultiBuffer, handleActivateMultiBuffer, handleCloseMultiBuffer, handleActivateFile } = useEditorTabActions(setActive, openMultiBuffer, closeMultiBuffer);
  const activeMultiBufferId = useActiveMultiBufferId();

  return (
    <div style={containerStyle}>
      <FileTabsRow openFiles={openFiles} activeIndex={activeIndex} onActivate={handleActivateFile}
        onClose={closeFile} onPin={pinTab} onUnpin={unpinTab} onTogglePin={togglePin}
        onCloseOthers={closeOthers} onCloseToRight={closeToRight} onCloseAll={closeAll} />
      {openSpecialViews.map((view) => (
        <SpecialViewTab key={view} specialView={view} isActive={view === activeSpecialView}
          onClick={() => onSpecialViewClick(view)} onClose={() => onSpecialViewClose(view)} />
      ))}
      <MultiBufferTabs buffers={multiBuffers} activeId={activeMultiBufferId}
        onActivate={handleActivateMultiBuffer} onClose={handleCloseMultiBuffer} onRename={renameMultiBuffer} />
      <NewMultiBufferButton onClick={handleNewMultiBuffer} />
      {openFiles.length === 0 && multiBuffers.length === 0 && <div style={spacerStyle} aria-hidden="true" />}
      <div style={spacerStyle} />
      {openFiles.length > 0 && <SplitEditorButton isSplit={split.isSplit} onSplit={() => splitRight()} onCloseSplit={closeSplit} />}
    </div>
  );
}

// Re-export for downstream consumers
export { activateMultiBuffer, deactivateMultiBuffer };
