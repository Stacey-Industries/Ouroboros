import React, { forwardRef, memo, useImperativeHandle } from 'react';
import { useInlineEditorController } from './useInlineEditorController';

export interface InlineEditorProps {
  content: string;
  filePath: string;
  themeId: string;
  /** Project root — required for LSP integration */
  projectRoot?: string | null;
  onSave: (content: string) => void;
  onDirtyChange: (dirty: boolean) => void;
}

export interface InlineEditorHandle {
  getContent(): string;
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
  }), [viewRef]);
  return <div ref={containerRef} style={editorContainerStyle} />;
});

InlineEditorComponent.displayName = 'InlineEditor';

export const InlineEditor = memo(InlineEditorComponent);
