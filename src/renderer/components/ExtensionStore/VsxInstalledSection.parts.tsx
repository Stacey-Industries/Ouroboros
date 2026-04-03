import React from 'react';

import type { Theme } from '../../themes';
import type {
  ExtensionIconThemeData,
  ExtensionProductIconThemeData,
  InstalledVsxExtension,
} from '../../types/electron';
import { smallButtonStyle } from '../Settings/settingsStyles';
import { ThemeActionCollections } from './VsxInstalledSection.actions';
import {
  contribStyle,
  controlsStyle,
  descStyle,
  disabledBadgeStyle,
  emptyStyle,
  footerStyle,
  listStyle,
  mutedStyle,
  nameRowStyle,
  nameStyle,
  rowStyle,
  versionStyle,
} from './vsxInstalledSectionStyles';

export interface VsxInstalledBodyProps {
  activeFileIconThemeId: string;
  activeProductIconThemeId: string;
  activeThemeId: string;
  disabledIds: Set<string>;
  extensionThemes: Theme[];
  extensions: InstalledVsxExtension[];
  fileIconThemes: ExtensionIconThemeData[];
  loading: boolean;
  onApplyFileIconTheme: (themeId: string) => Promise<void>;
  onApplyProductIconTheme: (themeId: string) => Promise<void>;
  onApplyTheme: (themeId: string) => Promise<void>;
  onOpenAppearance: () => void;
  onRefresh: () => void;
  onToggle: (id: string) => void;
  onUninstall: (id: string) => void;
  productIconThemes: ExtensionProductIconThemeData[];
}

interface VsxRowProps {
  activeFileIconThemeId: string;
  activeProductIconThemeId: string;
  activeThemeId: string;
  ext: InstalledVsxExtension;
  extensionThemes: Theme[];
  fileIconThemes: ExtensionIconThemeData[];
  isDisabled: boolean;
  isLast: boolean;
  onApplyFileIconTheme: (themeId: string) => Promise<void>;
  onApplyProductIconTheme: (themeId: string) => Promise<void>;
  onApplyTheme: (themeId: string) => Promise<void>;
  onOpenAppearance: () => void;
  onToggle: (id: string) => void;
  onUninstall: (id: string) => void;
  productIconThemes: ExtensionProductIconThemeData[];
}

export function VsxInstalledBody(props: VsxInstalledBodyProps): React.ReactElement {
  if (props.loading) {
    return (
      <p className="text-text-semantic-muted" style={mutedStyle}>
        Loading store extensions...
      </p>
    );
  }

  if (props.extensions.length === 0) {
    return (
      <div className="text-text-semantic-muted" style={emptyStyle}>
        No store extensions installed.
      </div>
    );
  }

  return (
    <div style={listStyle}>
      {props.extensions.map((ext, idx) => (
        <VsxRow key={ext.id} {...buildVsxRowProps(ext, idx, props)} />
      ))}
      <VsxRefreshFooter onRefresh={props.onRefresh} />
    </div>
  );
}

function buildVsxRowProps(
  ext: InstalledVsxExtension,
  idx: number,
  props: VsxInstalledBodyProps,
): VsxRowProps {
  return {
    activeFileIconThemeId: props.activeFileIconThemeId,
    activeProductIconThemeId: props.activeProductIconThemeId,
    activeThemeId: props.activeThemeId,
    ext,
    extensionThemes: props.extensionThemes.filter((theme) => theme.id.startsWith(`ext:${ext.id}:`)),
    fileIconThemes: props.fileIconThemes.filter((theme) => theme.extensionId === ext.id),
    isDisabled: props.disabledIds.has(ext.id),
    isLast: idx === props.extensions.length - 1,
    onApplyFileIconTheme: props.onApplyFileIconTheme,
    onApplyProductIconTheme: props.onApplyProductIconTheme,
    onApplyTheme: props.onApplyTheme,
    onOpenAppearance: props.onOpenAppearance,
    onToggle: props.onToggle,
    onUninstall: props.onUninstall,
    productIconThemes: props.productIconThemes.filter((theme) => theme.extensionId === ext.id),
  };
}

function VsxRefreshFooter({ onRefresh }: { onRefresh: () => void }): React.ReactElement {
  return (
    <div style={footerStyle}>
      <button onClick={onRefresh} className="text-text-semantic-primary" style={smallButtonStyle}>
        Refresh
      </button>
    </div>
  );
}

function VsxRow({
  activeFileIconThemeId,
  activeProductIconThemeId,
  activeThemeId,
  ext,
  extensionThemes,
  fileIconThemes,
  isDisabled,
  isLast,
  onApplyFileIconTheme,
  onApplyProductIconTheme,
  onApplyTheme,
  onOpenAppearance,
  onToggle,
  onUninstall,
  productIconThemes,
}: VsxRowProps): React.ReactElement {
  return (
    <div style={rowStyle(isLast)}>
      <VsxRowInfo ext={ext} isDisabled={isDisabled} />
      <VsxRowActions
        activeFileIconThemeId={activeFileIconThemeId}
        activeProductIconThemeId={activeProductIconThemeId}
        activeThemeId={activeThemeId}
        ext={ext}
        extensionThemes={extensionThemes}
        fileIconThemes={fileIconThemes}
        isDisabled={isDisabled}
        onApplyFileIconTheme={onApplyFileIconTheme}
        onApplyProductIconTheme={onApplyProductIconTheme}
        onApplyTheme={onApplyTheme}
        onOpenAppearance={onOpenAppearance}
        onToggle={onToggle}
        onUninstall={onUninstall}
        productIconThemes={productIconThemes}
      />
    </div>
  );
}

function VsxRowInfo({
  ext,
  isDisabled,
}: {
  ext: InstalledVsxExtension;
  isDisabled: boolean;
}): React.ReactElement {
  const contributions = summarizeContributions(ext);
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={nameRowStyle}>
        <span className="text-text-semantic-primary" style={nameStyle}>
          {ext.displayName || ext.name}
        </span>
        <span className="text-text-semantic-muted" style={versionStyle}>
          v{ext.version}
        </span>
        {isDisabled && <span style={disabledBadgeStyle}>Disabled</span>}
      </div>
      {ext.description && (
        <div className="text-text-semantic-muted" style={descStyle}>
          {ext.description}
        </div>
      )}
      {contributions && (
        <div className="text-text-semantic-muted" style={contribStyle}>
          {contributions}
        </div>
      )}
    </div>
  );
}

function VsxRowActions(props: Omit<VsxRowProps, 'isLast'>): React.ReactElement {
  const { ext, isDisabled, onOpenAppearance, onToggle, onUninstall } = props;
  return (
    <div style={controlsStyle}>
      <VsxThemeActions {...props} />
      <VsxUtilityButtons
        extensionId={ext.id}
        hasThemeContributions={Boolean(ext.contributes.themes?.length)}
        isDisabled={isDisabled}
        onOpenAppearance={onOpenAppearance}
        onToggle={onToggle}
        onUninstall={onUninstall}
      />
    </div>
  );
}

function VsxThemeActions({
  activeFileIconThemeId,
  activeProductIconThemeId,
  activeThemeId,
  extensionThemes,
  fileIconThemes,
  isDisabled,
  onApplyFileIconTheme,
  onApplyProductIconTheme,
  onApplyTheme,
  productIconThemes,
}: Pick<
  VsxRowProps,
  | 'activeFileIconThemeId'
  | 'activeProductIconThemeId'
  | 'activeThemeId'
  | 'extensionThemes'
  | 'fileIconThemes'
  | 'isDisabled'
  | 'onApplyFileIconTheme'
  | 'onApplyProductIconTheme'
  | 'onApplyTheme'
  | 'productIconThemes'
>): React.ReactElement | null {
  if (isDisabled) return null;
  return (
    <ThemeActionCollections
      activeFileIconThemeId={activeFileIconThemeId}
      activeProductIconThemeId={activeProductIconThemeId}
      activeThemeId={activeThemeId}
      extensionThemes={extensionThemes}
      fileIconThemes={fileIconThemes}
      onApplyFileIconTheme={onApplyFileIconTheme}
      onApplyProductIconTheme={onApplyProductIconTheme}
      onApplyTheme={onApplyTheme}
      productIconThemes={productIconThemes}
    />
  );
}

function VsxUtilityButtons({
  extensionId,
  hasThemeContributions,
  isDisabled,
  onOpenAppearance,
  onToggle,
  onUninstall,
}: {
  extensionId: string;
  hasThemeContributions: boolean;
  isDisabled: boolean;
  onOpenAppearance: () => void;
  onToggle: (id: string) => void;
  onUninstall: (id: string) => void;
}): React.ReactElement {
  return (
    <>
      {hasThemeContributions ? (
        <button onClick={onOpenAppearance} title="Open Appearance settings" style={smallButtonStyle}>
          Appearance
        </button>
      ) : null}
      <button onClick={() => onToggle(extensionId)} style={smallButtonStyle}>
        {isDisabled ? 'Enable' : 'Disable'}
      </button>
      <button
        onClick={() => onUninstall(extensionId)}
        className="text-status-error"
        style={smallButtonStyle}
      >
        Uninstall
      </button>
    </>
  );
}

function summarizeContributions(ext: InstalledVsxExtension): string {
  const items: Array<[number | undefined, string]> = [
    [ext.contributes.themes?.length, 'theme'],
    [ext.contributes.iconThemes?.length, 'icon theme'],
    [ext.contributes.productIconThemes?.length, 'product icon theme'],
    [ext.contributes.grammars?.length, 'grammar'],
    [ext.contributes.snippets?.length, 'snippet'],
    [ext.contributes.languages?.length, 'language'],
  ];
  return items
    .flatMap(([count, label]) => (count ? [`${count} ${label}${count > 1 ? 's' : ''}`] : []))
    .join(' · ');
}
