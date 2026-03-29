import React from 'react';

import type { ExtensionInfo } from '../../types/electron';
import {
  EmptyExtensionsState,
  ErrorPanel,
  ExtensionLogPanel,
  stopAndRun,
} from './ExtensionsInstalledSectionHelpers';
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
  extensionsSectionErrorLineStyle,
  extensionsSectionExtensionNameStyle,
  extensionsSectionListContainerStyle,
  extensionsSectionMutedTextStyle,
} from './extensionsSectionStyles';
import {
  extensionsSectionPermissionBadgeStyle,
  extensionsSectionRowStyle,
  extensionsSectionStatusBadgeStyle,
  extensionsSectionStatusDotStyle,
  extensionsSectionSummaryColumnStyle,
  extensionsSectionSummaryHeaderStyle,
  extensionsSectionToggleButtonStyle,
  extensionsSectionVersionStyle,
} from './extensionsSectionStyles2';
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
}: InstalledExtensionsSectionProps): React.ReactElement<any> {
  return (
    <section>
      <SectionLabel>Installed Extensions</SectionLabel>
      <InstalledExtensionsBody model={model} />
      {model.selectedExtension && (
        <SelectedExtensionPanel
          extension={model.selectedExtension}
          extLog={model.extLog}
          logLoading={model.logLoading}
          onRefresh={() =>
            void model.fetchLog(model.selectedExtensionName ?? model.selectedExtension!.name)
          }
        />
      )}
    </section>
  );
}

function InstalledExtensionsBody({ model }: InstalledExtensionsSectionProps): React.ReactElement<any> {
  if (model.loading)
    return (
      <p className="text-text-semantic-muted" style={extensionsSectionMutedTextStyle}>
        Loading extensions...
      </p>
    );
  if (model.error) return <ErrorPanel message={model.error} />;
  if (model.extensionsList.length === 0) return <EmptyExtensionsState />;
  return <ExtensionsList model={model} />;
}

function ExtensionsList({ model }: InstalledExtensionsSectionProps): React.ReactElement<any> {
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
}: ExtensionRowProps): React.ReactElement<any> {
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

function ExtensionSummary({ extension }: { extension: ExtensionInfo }): React.ReactElement<any> {
  return (
    <div style={extensionsSectionSummaryColumnStyle}>
      <div style={extensionsSectionSummaryHeaderStyle}>
        <span style={extensionsSectionStatusDotStyle(extension.status)} />
        <span className="text-text-semantic-primary" style={extensionsSectionExtensionNameStyle}>
          {extension.name}
        </span>
        <span className="text-text-semantic-muted" style={extensionsSectionVersionStyle}>
          v{extension.version}
        </span>
        <span style={extensionsSectionStatusBadgeStyle(extension.status)}>
          {STATUS_LABELS[extension.status]}
        </span>
      </div>
      {extension.description && (
        <span className="text-text-semantic-muted" style={extensionsSectionDescriptionStyle}>
          {extension.description}
        </span>
      )}
      {extension.status === 'error' && extension.errorMessage && (
        <span className="text-status-error" style={extensionsSectionErrorLineStyle}>
          Error: {extension.errorMessage}
        </span>
      )}
    </div>
  );
}

function ExtensionControls({
  extension,
  onForceActivate,
  onToggle,
  onUninstall,
}: Omit<ExtensionRowProps, 'isLast' | 'isSelected' | 'onSelect'>): React.ReactElement<any> {
  return (
    <div style={extensionsSectionControlRowStyle}>
      {extension.status === 'pending' && (
        <button
          onClick={(event) => stopAndRun(event, () => onForceActivate(extension.name))}
          title="Force activate this pending extension"
          className="text-status-warning"
          style={{ ...smallButtonStyle, borderColor: 'var(--status-warning)' }}
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
        className="text-status-error"
        style={smallButtonStyle}
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
}: SelectedExtensionPanelProps): React.ReactElement<any> {
  return (
    <div style={extensionsSectionDetailPanelStyle}>
      <ExtensionDetailsHeader extension={extension} />
      <ExtensionLogPanel extLog={extLog} logLoading={logLoading} onRefresh={onRefresh} />
    </div>
  );
}

function ExtensionDetailsHeader({ extension }: { extension: ExtensionInfo }): React.ReactElement<any> {
  return (
    <div style={extensionsSectionDetailHeaderStyle}>
      <div className="text-text-semantic-primary" style={extensionsSectionDetailTitleStyle}>
        {extension.name}{' '}
        <span className="text-text-semantic-muted" style={extensionsSectionDetailVersionStyle}>
          v{extension.version}
        </span>
      </div>
      {extension.author && (
        <div className="text-text-semantic-muted" style={extensionsSectionAuthorStyle}>
          Author: {extension.author}
        </div>
      )}
      {extension.permissions.length > 0 && <BadgeStrip values={extension.permissions} />}
      <ActivationEvents events={extension.activationEvents} />
    </div>
  );
}

function BadgeStrip({ values }: { values: string[] }): React.ReactElement<any> {
  return (
    <div style={extensionsSectionBadgeStripStyle}>
      {values.map((value) => (
        <span
          key={value}
          className="text-text-semantic-muted"
          style={extensionsSectionPermissionBadgeStyle}
        >
          {value}
        </span>
      ))}
    </div>
  );
}

function ActivationEvents({ events }: { events: string[] }): React.ReactElement<any> {
  return (
    <div style={extensionsSectionActivationRowStyle}>
      <span className="text-text-semantic-muted" style={extensionsSectionActivationLabelStyle}>
        Activates on:
      </span>
      {events.map((eventName) => (
        <span
          key={eventName}
          className="text-interactive-accent"
          style={extensionsSectionActivationBadgeStyle}
        >
          {eventName}
        </span>
      ))}
    </div>
  );
}
