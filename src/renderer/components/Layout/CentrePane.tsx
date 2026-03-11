import React from 'react';

export interface CentrePaneProps {
  tabBar?: React.ReactNode;
  children?: React.ReactNode;
  /** Inline style from focus manager (e.g. box-shadow ring) */
  focusStyle?: React.CSSProperties;
  /** Called when the pane is clicked to acquire focus */
  onFocus?: () => void;
}

export function CentrePane({ tabBar, children, focusStyle, onFocus }: CentrePaneProps): React.ReactElement {
  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      className="flex flex-col flex-1 h-full min-w-0 bg-[var(--bg)]"
      aria-label="Editor pane"
      style={focusStyle}
      onClick={onFocus}
    >
      {/* Tab bar for open files */}
      {tabBar && (
        <div
          className="
            flex-shrink-0 flex items-center h-9
            bg-[var(--bg-secondary)] border-b border-[var(--border)]
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
