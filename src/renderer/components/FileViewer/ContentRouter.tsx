import React, { memo } from 'react';
import type { RefObject } from 'react';
import { ClaudeMdEditor } from './ClaudeMdEditor';
import { InlineEditor } from './InlineEditor';
import { CommitHistory } from './CommitHistory';
import { MarkdownPreview } from './MarkdownPreview';
import { DiffView } from './DiffView';
import { ConflictResolver } from './ConflictResolver';
import { CodeView } from './CodeView';
import { MonacoEditor } from './MonacoEditor';
import { MonacoDiffEditor } from './MonacoDiffEditor';
import { detectLanguage } from './monacoSetup';
import type { CodeViewProps } from './CodeView';
import type { ConflictBlock } from './ConflictResolver';

/**
 * Feature flag: when true, Monaco Editor is used for code views instead of the
 * Shiki-based CodeView + CodeMirror InlineEditor. Set to `false` to revert to
 * the legacy viewers if issues are found.
 */
const USE_MONACO = true;

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

  // ── Monaco-specific props ─────────────────────────────────────────────
  /** Word wrap toggle state (drives Monaco wordWrap option) */
  wordWrap?: boolean;
  /** Minimap toggle state (drives Monaco minimap.enabled option) */
  showMinimap?: boolean;
  /** Format document before saving */
  formatOnSave?: boolean;
}

type ConditionalRenderer = (props: ContentRouterProps) => React.ReactElement | null;

const fullPanelStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'hidden',
};

const previewPanelStyle: React.CSSProperties = {
  ...fullPanelStyle,
  display: 'flex',
};

const noop = (): void => {};

function renderPanel(
  child: React.ReactElement,
  style: React.CSSProperties = fullPanelStyle,
): React.ReactElement {
  return <div style={style}>{child}</div>;
}

function renderEditorContent(props: ContentRouterProps): React.ReactElement | null {
  if (!props.editMode || !props.filePath || props.content == null || !props.onSave) {
    return null;
  }

  // CLAUDE.md files always use the specialised editor (CodeMirror-based)
  if (props.isClaudeMd && props.claudeMdEnhanced) {
    return renderPanel(
      <ClaudeMdEditor
        content={props.content}
        filePath={props.filePath}
        themeId={props.ideThemeId}
        projectRoot={props.projectRoot}
        onSave={props.onSave}
        onDirtyChange={props.onDirtyChange ?? noop}
      />,
    );
  }

  // When Monaco is enabled, use it for edit mode (same component, readOnly=false)
  if (USE_MONACO) {
    return renderPanel(
      <MonacoEditor
        key={props.filePath}
        filePath={props.filePath}
        content={props.content}
        readOnly={false}
        onSave={props.onSave}
        onDirtyChange={props.onDirtyChange ?? noop}
        wordWrap={props.wordWrap}
        showMinimap={props.showMinimap}
        formatOnSave={props.formatOnSave}
      />,
    );
  }

  // Legacy: CodeMirror InlineEditor
  return renderPanel(
    <InlineEditor
      content={props.content}
      filePath={props.filePath}
      themeId={props.ideThemeId}
      projectRoot={props.projectRoot}
      onSave={props.onSave}
      onDirtyChange={props.onDirtyChange ?? noop}
    />,
  );
}

function renderHistoryContent(props: ContentRouterProps): React.ReactElement | null {
  if (!props.showHistory || !props.filePath || !props.projectRoot) {
    return null;
  }

  return renderPanel(<CommitHistory filePath={props.filePath} projectRoot={props.projectRoot} />);
}

function renderPreviewContent(props: ContentRouterProps): React.ReactElement | null {
  if (props.viewMode !== 'preview' || !props.isMarkdown || props.content == null) {
    return null;
  }

  return renderPanel(<MarkdownPreview content={props.content} />, previewPanelStyle);
}

function renderDiffContent(props: ContentRouterProps): React.ReactElement | null {
  if (props.viewMode !== 'diff' || !props.hasDiff || props.originalContent == null || props.content == null) {
    return null;
  }

  if (USE_MONACO) {
    const language = props.filePath
      ? detectLanguage(props.filePath)
      : 'plaintext';
    return renderPanel(
      <MonacoDiffEditor
        originalContent={props.originalContent}
        modifiedContent={props.content}
        language={language}
        filePath={props.filePath ?? undefined}
        readOnly={true}
      />,
    );
  }

  return renderPanel(
    <DiffView originalContent={props.originalContent} currentContent={props.content} />,
  );
}

function renderConflictContent(props: ContentRouterProps): React.ReactElement | null {
  const hasConflictView = props.conflictBlocks.length > 0 && props.viewMode === 'code';
  if (!hasConflictView || props.content == null || props.filePath == null) {
    return null;
  }

  return renderPanel(
    <ConflictResolver
      content={props.content}
      filePath={props.filePath}
      onResolved={props.handleConflictResolved}
    />,
  );
}

const conditionalRenderers: readonly ConditionalRenderer[] = [
  renderEditorContent,
  renderHistoryContent,
  renderPreviewContent,
  renderDiffContent,
  renderConflictContent,
];

function resolveContent(props: ContentRouterProps): React.ReactElement {
  for (const render of conditionalRenderers) {
    const content = render(props);
    if (content) {
      return content;
    }
  }

  // Default: code view (read-only)
  if (USE_MONACO && props.filePath && props.content != null) {
    return renderPanel(
      <MonacoEditor
        key={props.filePath}
        filePath={props.filePath}
        content={props.content}
        readOnly={true}
        onSave={props.onSave}
        onDirtyChange={props.onDirtyChange}
        wordWrap={props.wordWrap}
        showMinimap={props.showMinimap}
      />,
    );
  }

  // Legacy: Shiki-based CodeView
  return <CodeView scrollRef={props.scrollRef} codeRef={props.codeRef} {...props.codeViewProps} />;
}

/**
 * Routes between editor, history, preview, diff, conflict, and code views.
 */
export const ContentRouter = memo(function ContentRouter(
  props: ContentRouterProps,
): React.ReactElement {
  return resolveContent(props);
});
