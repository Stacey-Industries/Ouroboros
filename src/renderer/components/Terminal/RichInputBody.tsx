import React, { memo } from 'react';

import {
  useLineNumberConfig,
  useRichInputEditorMount,
  useRichInputEditorState,
  useVisibleFocus,
} from './RichInputBody.hooks';
import {
  closeBtnStyle,
  dividerStyle,
  editorHostStyle,
  getLineNumberButtonStyle,
  panelStyle,
  richInputAnimationCss,
  submitBtnStyle,
  toolbarPrimaryStyle,
  toolbarSecondaryStyle,
  toolbarStyle,
  toolbarTitleStyle,
} from './RichInputBody.styles';

export interface RichInputProps {
  sessionId: string;
  onSubmit: (text: string) => void;
  onCancel: () => void;
  visible: boolean;
  shellType?: 'bash' | 'zsh' | 'powershell' | 'cmd';
}

function ToolbarStart({
  onToggleLineNumbers,
  showLineNumbers,
}: {
  onToggleLineNumbers: () => void;
  showLineNumbers: boolean;
}): React.ReactElement {
  return (
    <div className="text-text-semantic-muted" style={toolbarPrimaryStyle}>
      <span style={toolbarTitleStyle}>Multi-line Input</span>
      <button
        onClick={onToggleLineNumbers}
        title="Toggle line numbers"
        style={getLineNumberButtonStyle(showLineNumbers)}
      >
        #
      </button>
    </div>
  );
}

function ToolbarActionButtons({
  doCancel,
  doSubmit,
}: {
  doCancel: () => void;
  doSubmit: () => void;
}): React.ReactElement {
  return (
    <>
      <button onClick={doCancel} title="Close multi-line input" style={closeBtnStyle}>
        Close
      </button>
      <button onClick={doSubmit} title="Submit (Ctrl+Enter)" style={submitBtnStyle}>
        Submit
      </button>
    </>
  );
}

function ToolbarEnd({
  doCancel,
  doSubmit,
}: {
  doCancel: () => void;
  doSubmit: () => void;
}): React.ReactElement {
  return (
    <div className="text-text-semantic-faint" style={toolbarSecondaryStyle}>
      <span>Ctrl+Up/Down: history</span>
      <span style={dividerStyle}>|</span>
      <span>Esc: cancel</span>
      <ToolbarActionButtons doCancel={doCancel} doSubmit={doSubmit} />
    </div>
  );
}

function RichInputToolbar({
  doCancel,
  doSubmit,
  onToggleLineNumbers,
  showLineNumbers,
}: {
  doCancel: () => void;
  doSubmit: () => void;
  onToggleLineNumbers: () => void;
  showLineNumbers: boolean;
}): React.ReactElement {
  return (
    <div style={toolbarStyle}>
      <ToolbarStart onToggleLineNumbers={onToggleLineNumbers} showLineNumbers={showLineNumbers} />
      <ToolbarEnd doCancel={doCancel} doSubmit={doSubmit} />
    </div>
  );
}

function RichInputPanel({
  containerRef,
  doCancel,
  doSubmit,
  onToggleLineNumbers,
  showLineNumbers,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  doCancel: () => void;
  doSubmit: () => void;
  onToggleLineNumbers: () => void;
  showLineNumbers: boolean;
}): React.ReactElement {
  return (
    <div style={panelStyle}>
      <RichInputToolbar
        doCancel={doCancel}
        doSubmit={doSubmit}
        onToggleLineNumbers={onToggleLineNumbers}
        showLineNumbers={showLineNumbers}
      />
      <div ref={containerRef as React.RefObject<HTMLDivElement | null>} style={editorHostStyle} />
      <style>{richInputAnimationCss}</style>
    </div>
  );
}

export const RichInputBody = memo(function RichInputBody({
  onCancel,
  onSubmit,
  visible,
}: RichInputProps): React.ReactElement | null {
  const state = useRichInputEditorState(onSubmit, onCancel);
  const {
    containerRef,
    viewRef,
    highlightCompartment,
    lineNumCompartment,
    showLineNumbers,
    setShowLineNumbers,
    doSubmit,
    doCancel,
    navigateHistory,
  } = state;
  useRichInputEditorMount({
    containerRef,
    doCancel,
    doSubmit,
    highlightCompartment,
    lineNumCompartment,
    navigateHistory,
    viewRef,
  });
  useVisibleFocus(viewRef, visible);
  useLineNumberConfig(lineNumCompartment, showLineNumbers, viewRef);
  return visible ? (
    <RichInputPanel
      containerRef={containerRef}
      doCancel={doCancel}
      doSubmit={doSubmit}
      onToggleLineNumbers={() => setShowLineNumbers((v) => !v)}
      showLineNumbers={showLineNumbers}
    />
  ) : null;
});
