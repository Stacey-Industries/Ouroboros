/**
 * ExtensionsInstalledSectionHelpers.tsx — Helper components and utilities for
 * ExtensionsInstalledSection. Split out to keep both files under 300 lines.
 */

import React from 'react';

import {
  extensionsSectionEmptyStateStyle,
  extensionsSectionErrorPanelStyle,
  extensionsSectionItalicMutedTextStyle,
  extensionsSectionLogBodyStyle,
  extensionsSectionLogHeaderStyle,
  extensionsSectionLogTitleStyle,
} from './extensionsSectionStyles';
import { extensionsSectionRefreshButtonStyle } from './extensionsSectionStyles2';
import { smallButtonStyle } from './settingsStyles';

interface ExtensionLogPanelProps {
  extLog: string[];
  logLoading: boolean;
  onRefresh: () => void;
}

export function ExtensionLogPanel({
  extLog,
  logLoading,
  onRefresh,
}: ExtensionLogPanelProps): React.ReactElement<any> {
  return (
    <>
      <div style={extensionsSectionLogHeaderStyle}>
        <span className="text-text-semantic-muted" style={extensionsSectionLogTitleStyle}>
          Console Output
        </span>
        <button
          onClick={onRefresh}
          className="text-text-semantic-primary"
          style={extensionsSectionRefreshButtonStyle}
        >
          Refresh
        </button>
      </div>
      <div className="text-text-semantic-secondary" style={extensionsSectionLogBodyStyle}>
        {logLoading ? (
          <span className="text-text-semantic-muted" style={extensionsSectionItalicMutedTextStyle}>
            Loading...
          </span>
        ) : (
          <LogContent extLog={extLog} />
        )}
      </div>
    </>
  );
}

function LogContent({ extLog }: { extLog: string[] }): React.ReactElement<any> {
  if (extLog.length === 0) {
    return (
      <span className="text-text-semantic-muted" style={extensionsSectionItalicMutedTextStyle}>
        No output.
      </span>
    );
  }

  return (
    <>
      {extLog.map((line, index) => (
        <div key={`${line}-${index}`} style={{ color: getLogLineColor(line) }}>
          {line}
        </div>
      ))}
    </>
  );
}

export function EmptyExtensionsState(): React.ReactElement<any> {
  return (
    <div className="text-text-semantic-muted" style={extensionsSectionEmptyStateStyle}>
      No extensions installed. Place extension folders in the extensions directory or use
      &quot;Install from Folder&quot;.
    </div>
  );
}

export function ErrorPanel({ message }: { message: string }): React.ReactElement<any> {
  return (
    <div className="text-status-error" style={extensionsSectionErrorPanelStyle}>
      {message}
    </div>
  );
}

export function getLogLineColor(line: string): string {
  if (line.includes('[error]')) return 'var(--status-error)';
  if (line.includes('[warn]')) return 'var(--status-warning)';
  return 'var(--text-secondary)';
}

export function stopAndRun(
  event: React.MouseEvent<HTMLButtonElement>,
  action: () => Promise<void>,
): void {
  event.stopPropagation();
  void action();
}

// Re-export smallButtonStyle so ExtensionsInstalledSection can reference it directly
export { smallButtonStyle };
