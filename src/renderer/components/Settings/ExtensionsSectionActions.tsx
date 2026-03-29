import React from 'react';

import type { Command } from '../CommandPalette/types';
import {
  extensionsSectionActionButtonStyle,
  extensionsSectionActionRowStyle,
  extensionsSectionCommandIdStyle,
  extensionsSectionCommandLabelStyle,
  extensionsSectionCommandRowStyle,
  extensionsSectionCommandShortcutStyle,
  extensionsSectionCommandTextStyle,
  extensionsSectionErrorBannerStyle,
  extensionsSectionListContainerStyle,
  extensionsSectionMutedTextStyle,
} from './extensionsSectionStyles';
import { buttonStyle,SectionLabel } from './settingsStyles';
import type { ExtensionsSectionModel } from './useExtensionsSection';

interface ActionErrorBannerProps {
  message: string;
}

interface ExtensionActionButtonsProps {
  model: ExtensionsSectionModel;
}

interface ExtensionCommandsSectionProps {
  commands: Command[];
}

interface CommandRowProps {
  command: Command;
  isLast: boolean;
}

export function ActionErrorBanner({
  message,
}: ActionErrorBannerProps): React.ReactElement<any> {
  return (
    <div role="alert" className="text-status-error" style={extensionsSectionErrorBannerStyle}>
      {message}
    </div>
  );
}

export function ExtensionActionButtons({
  model,
}: ExtensionActionButtonsProps): React.ReactElement<any> {
  return (
    <section style={extensionsSectionActionRowStyle}>
      <button
        onClick={() => void model.installFromFolder()}
        disabled={model.isInstalling}
        style={extensionsSectionActionButtonStyle(model.isInstalling)}
      >
        {model.isInstalling ? 'Installing...' : 'Install from Folder'}
      </button>
      <button
        onClick={() => void model.openExtensionsFolder()}
        disabled={model.isOpening}
        style={extensionsSectionActionButtonStyle(model.isOpening)}
      >
        {model.isOpening ? 'Opening...' : 'Open Extensions Folder'}
      </button>
      <button onClick={() => void model.fetchExtensions()} className="text-text-semantic-primary" style={buttonStyle}>
        Refresh List
      </button>
    </section>
  );
}

export function ExtensionCommandsSection({
  commands,
}: ExtensionCommandsSectionProps): React.ReactElement<any> {
  return (
    <section>
      <SectionLabel>Extension Commands</SectionLabel>
      <p className="text-text-semantic-muted" style={{ ...extensionsSectionMutedTextStyle, marginBottom: '12px' }}>
        {getCommandSummary(commands)}
      </p>
      {commands.length > 0 && (
        <div style={extensionsSectionListContainerStyle}>
          {commands.map((command, index) => (
            <CommandRow
              key={command.id}
              command={command}
              isLast={index === commands.length - 1}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function CommandRow({
  command,
  isLast,
}: CommandRowProps): React.ReactElement<any> {
  return (
    <div style={extensionsSectionCommandRowStyle(isLast)}>
      <div style={extensionsSectionCommandTextStyle}>
        <span className="text-text-semantic-primary" style={extensionsSectionCommandLabelStyle}>{command.label}</span>
        <span className="text-text-semantic-muted" style={extensionsSectionCommandIdStyle}>{command.id}</span>
      </div>
      {command.shortcut && (
        <kbd className="text-text-semantic-muted" style={extensionsSectionCommandShortcutStyle}>{command.shortcut}</kbd>
      )}
    </div>
  );
}

function getCommandSummary(commands: Command[]): string {
  if (commands.length === 0) return 'No extension commands registered.';
  return `${commands.length} extension command${commands.length !== 1 ? 's' : ''} currently registered.`;
}
