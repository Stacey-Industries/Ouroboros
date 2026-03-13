import React, { memo } from 'react';
import type { RefObject } from 'react';
import { ClaudeMdEditor } from './ClaudeMdEditor';
import { InlineEditor } from './InlineEditor';
import { CommitHistory } from './CommitHistory';
import { MarkdownPreview } from './MarkdownPreview';
import { DiffView } from './DiffView';
import { ConflictResolver } from './ConflictResolver';
import { CodeView } from './CodeView';
import type { CodeViewProps } from './CodeView';
import type { ConflictBlock } from './ConflictResolver';

export interface ContentRouterProps {
  /** Current view mode */
  viewMode: 'code' | 'diff' | 'preview';
  /** Whether edit mode is on */
  editMode: boolean;
  /** Whether this is a CLAUDE.md file */
  isClaudeMd: boolean;
  /** Whether to use enhanced CLAUDE.md editor */
  claudeMdEnhanced: boolean;
  /** File path */
  filePath: string | null;
  /** File content */
  content: string | null;
  /** IDE theme id */
  ideThemeId: string;
  /** Project root */
  projectRoot?: string | null;
  /** Save handler */
  onSave?: (content: string) => void;
  /** Dirty change handler */
  onDirtyChange?: (dirty: boolean) => void;
  /** Show history view */
  showHistory: boolean;
  /** Is markdown file */
  isMarkdown: boolean;
  /** Has diff */
  hasDiff: boolean;
  /** Original content for diff */
  originalContent?: string | null;
  /** Conflict blocks */
  conflictBlocks: ConflictBlock[];
  /** Conflict resolved handler */
  handleConflictResolved: (newContent: string) => void;
  /** Code view props (forwarded when in code mode) */
  codeViewProps: Omit<CodeViewProps, 'scrollRef' | 'codeRef'>;
  scrollRef: RefObject<HTMLDivElement | null>;
  codeRef: RefObject<HTMLDivElement | null>;
}

const fullPanelStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'hidden',
};

/**
 * Routes between editor, history, preview, diff, conflict, and code views.
 */
export const ContentRouter = memo(function ContentRouter(
  props: ContentRouterProps
): React.ReactElement | null {
  // CLAUDE.md enhanced editor
  if (props.editMode && props.isClaudeMd && props.claudeMdEnhanced && props.filePath && props.content != null && props.onSave) {
    return (
      <div style={fullPanelStyle}>
        <ClaudeMdEditor
          content={props.content}
          filePath={props.filePath}
          themeId={props.ideThemeId}
          projectRoot={props.projectRoot}
          onSave={props.onSave}
          onDirtyChange={props.onDirtyChange ?? (() => {})}
        />
      </div>
    );
  }

  // Inline editor
  if (props.editMode && props.filePath && props.content != null && props.onSave) {
    return (
      <div style={fullPanelStyle}>
        <InlineEditor
          content={props.content}
          filePath={props.filePath}
          themeId={props.ideThemeId}
          projectRoot={props.projectRoot}
          onSave={props.onSave}
          onDirtyChange={props.onDirtyChange ?? (() => {})}
        />
      </div>
    );
  }

  // Commit history
  if (props.showHistory && props.filePath && props.projectRoot) {
    return (
      <div style={fullPanelStyle}>
        <CommitHistory filePath={props.filePath} projectRoot={props.projectRoot} />
      </div>
    );
  }

  // Markdown preview
  if (props.viewMode === 'preview' && props.isMarkdown && props.content != null) {
    return (
      <div style={{ ...fullPanelStyle, display: 'flex' }}>
        <MarkdownPreview content={props.content} />
      </div>
    );
  }

  // Diff view
  if (props.viewMode === 'diff' && props.hasDiff && props.originalContent != null && props.content != null) {
    return (
      <div style={fullPanelStyle}>
        <DiffView originalContent={props.originalContent} currentContent={props.content} />
      </div>
    );
  }

  // Conflict resolver
  if (props.conflictBlocks.length > 0 && props.content != null && props.filePath != null && props.viewMode === 'code') {
    return (
      <div style={fullPanelStyle}>
        <ConflictResolver
          content={props.content}
          filePath={props.filePath}
          onResolved={props.handleConflictResolved}
        />
      </div>
    );
  }

  // Code view (default)
  return (
    <CodeView
      scrollRef={props.scrollRef}
      codeRef={props.codeRef}
      {...props.codeViewProps}
    />
  );
});
