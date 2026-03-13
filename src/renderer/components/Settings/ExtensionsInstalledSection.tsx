import React from 'react';
import type { ExtensionInfo } from '../../types/electron';
import {
  extensionsSectionActivationBadgeStyle,
  extensionsSectionActivationLabelStyle,
  extensionsSectionActivationRowStyle,
  extensionsSectionAuthorStyle,
  extensionsSectionBadgeStripStyle,
  extensionsSectionControlRowStyle,
  extensionsSectionDescriptionStyle,
  extensionsSectionDetailHeaderStyle,
  extensionsSectionDetailPanelStyle,
  extensionsSectionDetailTitleStyle,
  extensionsSectionDetailVersionStyle,
  extensionsSectionEmptyStateStyle,
  extensionsSectionErrorLineStyle,
  extensionsSectionErrorPanelStyle,
  extensionsSectionExtensionNameStyle,
  extensionsSectionItalicMutedTextStyle,
  extensionsSectionListContainerStyle,
  extensionsSectionLogBodyStyle,
  extensionsSectionLogHeaderStyle,
  extensionsSectionLogTitleStyle,
  extensionsSectionMutedTextStyle,
  extensionsSectionPermissionBadgeStyle,
  extensionsSectionRefreshButtonStyle,
  extensionsSectionRowStyle,
  extensionsSectionStatusBadgeStyle,
  extensionsSectionStatusDotStyle,
  extensionsSectionSummaryColumnStyle,
  extensionsSectionSummaryHeaderStyle,
  extensionsSectionToggleButtonStyle,
  extensionsSectionVersionStyle,
} from './extensionsSectionStyles';
import { SectionLabel, smallButtonStyle } from './settingsStyles';
import type { ExtensionsSectionModel } from './useExtensionsSection';

const STATUS_LABELS: Record<ExtensionInfo['status'], string> = {
  active: 'Active',
  pending: 'Pending',
  inactive: 'Inactive',
  error: 'Error',
};

interface InstalledExtensionsSectionProps {
  model: ExtensionsSectionModel;
}

interface ExtensionRowProps {
  extension: ExtensionInfo;
  isLast: boolean;
  isSelected: boolean;
  onForceActivate: (name: string) => Promise<void>;
  onSelect: (name: string) => void;
  onToggle: (name: string, currentlyEnabled: boolean) => Promise<void>;
  onUninstall: (name: string) => Promise<void>;
}

interface SelectedExtensionPanelProps {
  extension: ExtensionInfo;
  extLog: string[];
  logLoading: boolean;
  onRefresh: () => void;
}

export function InstalledExtensionsSection({
  model,
}: InstalledExtensionsSectionProps): React.ReactElement {
  return (
    <section>
      <SectionLabel>Installed Extensions</SectionLabel>
      <InstalledExtensionsBody model={model} />
      {model.selectedExtension && (
        <SelectedExtensionPanel
          extension={model.selectedExtension}
          extLog={model.extLog}
          logLoading={model.logLoading}
          onRefresh={() => void model.fetchLog(model.selectedExtensionName ?? model.selectedExtension.name)}
        />
      )}
    </section>
  );
}

function InstalledExtensionsBody({
  model,
}: InstalledExtensionsSectionProps): React.ReactElement {
  if (model.loading) return <p style={extensionsSectionMutedTextStyle}>Loading extensions...</p>;
  if (model.error) return <ErrorPanel message={model.error} />;
  if (model.extensionsList.length === 0) return <EmptyExtensionsState />;
  return <ExtensionsList model={model} />;
}

function ExtensionsList({
  model,
}: InstalledExtensionsSectionProps): React.ReactElement {
  return (
    <div style={extensionsSectionListContainerStyle}>
      {model.extensionsList.map((extension, index) => (
        <ExtensionRow
          key={extension.name}
          extension={extension}
          isLast={index === model.extensionsList.length - 1}
          isSelected={model.selectedExtensionName === extension.name}
          onForceActivate={model.forceActivate}
          onSelect={model.selectExtension}
          onToggle={model.toggleExtension}
          onUninstall={model.uninstallExtension}
        />
      ))}
    </div>
  );
}

function ExtensionRow({
  extension,
  isLast,
  isSelected,
  onForceActivate,
  onSelect,
  onToggle,
  onUninstall,
}: ExtensionRowProps): React.ReactElement {
  return (
    <div
      style={extensionsSectionRowStyle(isSelected, isLast)}
      onClick={() => onSelect(extension.name)}
    >
      <ExtensionSummary extension={extension} />
      <ExtensionControls
        extension={extension}
        onForceActivate={onForceActivate}
        onToggle={onToggle}
        onUninstall={onUninstall}
      />
    </div>
  );
}

function ExtensionSummary({
  extension,
}: {
  extension: ExtensionInfo;
}): React.ReactElement {
  return (
    <div style={extensionsSectionSummaryColumnStyle}>
      <div style={extensionsSectionSummaryHeaderStyle}>
        <span style={extensionsSectionStatusDotStyle(extension.status)} />
        <span style={extensionsSectionExtensionNameStyle}>{extension.name}</span>
        <span style={extensionsSectionVersionStyle}>v{extension.version}</span>
        <span style={extensionsSectionStatusBadgeStyle(extension.status)}>
          {STATUS_LABELS[extension.status]}
        </span>
      </div>
      {extension.description && (
        <span style={extensionsSectionDescriptionStyle}>{extension.description}</span>
      )}
      {extension.status === 'error' && extension.errorMessage && (
        <span style={extensionsSectionErrorLineStyle}>Error: {extension.errorMessage}</span>
      )}
    </div>
  );
}

function ExtensionControls({
  extension,
  onForceActivate,
  onToggle,
  onUninstall,
}: Omit<ExtensionRowProps, 'isLast' | 'isSelected' | 'onSelect'>): React.ReactElement {
  return (
    <div style={extensionsSectionControlRowStyle}>
      {extension.status === 'pending' && (
        <button
          onClick={(event) => stopAndRun(event, () => onForceActivate(extension.name))}
          title="Force activate this pending extension"
          style={{ ...smallButtonStyle, color: '#facc15', borderColor: '#facc15' }}
        >
          Activate
        </button>
      )}
      <button
        onClick={(event) => stopAndRun(event, () => onToggle(extension.name, extension.enabled))}
        title={extension.enabled ? 'Disable' : 'Enable'}
        style={extensionsSectionToggleButtonStyle(extension.enabled)}
      >
        {extension.enabled ? 'Disable' : 'Enable'}
      </button>
      <button
        onClick={(event) => stopAndRun(event, () => onUninstall(extension.name))}
        title="Uninstall"
        style={{ ...smallButtonStyle, color: '#f87171' }}
      >
        Uninstall
      </button>
    </div>
  );
}

function SelectedExtensionPanel({
  extension,
  extLog,
  logLoading,
  onRefresh,
}: SelectedExtensionPanelProps): React.ReactElement {
  return (
    <div style={extensionsSectionDetailPanelStyle}>
      <ExtensionDetailsHeader extension={extension} />
      <ExtensionLogPanel extLog={extLog} logLoading={logLoading} onRefresh={onRefresh} />
    </div>
  );
}

function ExtensionDetailsHeader({
  extension,
}: {
  extension: ExtensionInfo;
}): React.ReactElement {
  return (
    <div style={extensionsSectionDetailHeaderStyle}>
      <div style={extensionsSectionDetailTitleStyle}>
        {extension.name} <span style={extensionsSectionDetailVersionStyle}>v{extension.version}</span>
      </div>
      {extension.author && <div style={extensionsSectionAuthorStyle}>Author: {extension.author}</div>}
      {extension.permissions.length > 0 && <BadgeStrip values={extension.permissions} />}
      <ActivationEvents events={extension.activationEvents} />
    </div>
  );
}

function BadgeStrip({ values }: { values: string[] }): React.ReactElement {
  return (
    <div style={extensionsSectionBadgeStripStyle}>
      {values.map((value) => (
        <span key={value} style={extensionsSectionPermissionBadgeStyle}>
          {value}
        </span>
      ))}
    </div>
  );
}

function ActivationEvents({ events }: { events: string[] }): React.ReactElement {
  return (
    <div style={extensionsSectionActivationRowStyle}>
      <span style={extensionsSectionActivationLabelStyle}>Activates on:</span>
      {events.map((eventName) => (
        <span key={eventName} style={extensionsSectionActivationBadgeStyle}>
          {eventName}
        </span>
      ))}
    </div>
  );
}

function ExtensionLogPanel({
  extLog,
  logLoading,
  onRefresh,
}: SelectedExtensionPanelProps): React.ReactElement {
  return (
    <>
      <div style={extensionsSectionLogHeaderStyle}>
        <span style={extensionsSectionLogTitleStyle}>Console Output</span>
        <button onClick={onRefresh} style={extensionsSectionRefreshButtonStyle}>
          Refresh
        </button>
      </div>
      <div style={extensionsSectionLogBodyStyle}>
        {logLoading ? (
          <span style={extensionsSectionItalicMutedTextStyle}>Loading...</span>
        ) : (
          <LogContent extLog={extLog} />
        )}
      </div>
    </>
  );
}

function LogContent({ extLog }: { extLog: string[] }): React.ReactElement {
  if (extLog.length === 0) {
    return <span style={extensionsSectionItalicMutedTextStyle}>No output.</span>;
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

function EmptyExtensionsState(): React.ReactElement {
  return (
    <div style={extensionsSectionEmptyStateStyle}>
      No extensions installed. Place extension folders in the extensions directory or use
      &quot;Install from Folder&quot;.
    </div>
  );
}

function ErrorPanel({ message }: { message: string }): React.ReactElement {
  return <div style={extensionsSectionErrorPanelStyle}>{message}</div>;
}

function getLogLineColor(line: string): string {
  if (line.includes('[error]')) return '#f87171';
  if (line.includes('[warn]')) return '#fbbf24';
  return 'var(--text-secondary)';
}

function stopAndRun(
  event: React.MouseEvent<HTMLButtonElement>,
  action: () => Promise<void>,
): void {
  event.stopPropagation();
  void action();
}
