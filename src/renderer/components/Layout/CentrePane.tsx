import React from 'react';

export interface CentrePaneProps {
  tabBar?: React.ReactNode;
  children?: React.ReactNode;
  /** Inline style from focus manager (e.g. box-shadow ring) */
  focusStyle?: React.CSSProperties;
  /** Extra inline style on the root element */
  rootStyle?: React.CSSProperties;
  /** Called when the pane is clicked to acquire focus */
  onFocus?: () => void;
}

export function CentrePane({ tabBar, children, focusStyle, rootStyle, onFocus }: CentrePaneProps): React.ReactElement {
  return (
    <div
      className="flex flex-col flex-1 min-h-0 min-w-0 bg-surface-base"
      aria-label="Editor pane"
      style={{ ...focusStyle, ...rootStyle }}
      onClick={onFocus}
    >
      {/* Tab bar for open files */}
      {tabBar && (
        <div
          data-layout="editor-tab-bar"
          className="
            flex-shrink-0 flex items-center h-9
            bg-surface-panel border-b border-border-semantic
            overflow-x-auto overflow-y-hidden
          "
          role="tablist"
          aria-label="Open files"
        >
          {tabBar}
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        {children}
      </div>
    </div>
  );
}
