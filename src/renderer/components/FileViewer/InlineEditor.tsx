import React, { forwardRef, memo, useImperativeHandle } from 'react';
import { EditorSelection } from '@codemirror/state';
import { useInlineEditorController } from './useInlineEditorController';

export interface InlineEditorProps {
  content: string;
  savedContent: string;
  filePath: string;
  themeId: string;
  /** Project root — required for LSP integration */
  projectRoot?: string | null;
  onSave: (content: string) => void;
  onContentChange: (content: string) => void;
  onDirtyChange: (dirty: boolean) => void;
}

export interface InlineEditorHandle {
  getContent(): string;
  setContent(content: string): void;
}

const editorContainerStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  overflow: 'hidden',
};

const InlineEditorComponent = forwardRef<InlineEditorHandle, InlineEditorProps>(function InlineEditor(props, ref): React.ReactElement {
  const { containerRef, viewRef } = useInlineEditorController(props);
  useImperativeHandle(ref, () => ({
    getContent: () => viewRef.current?.state.doc.toString() ?? '',
    setContent: (content: string) => {
      const view = viewRef.current;
      if (!view) {
        return;
      }
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: content },
        selection: EditorSelection.cursor(content.length),
      });
    },
  }), [viewRef]);
  return <div ref={containerRef} style={editorContainerStyle} />;
});

InlineEditorComponent.displayName = 'InlineEditor';

export const InlineEditor = memo(InlineEditorComponent);
