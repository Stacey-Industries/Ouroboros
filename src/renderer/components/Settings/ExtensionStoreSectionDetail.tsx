/**
 * ExtensionStoreSectionDetail.tsx — Detail panel for the Extension Store.
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';

import type { InstalledVsxExtension } from '../../types/electron';
import type { ExtensionStoreModel } from './extensionStoreModel';
import * as Styles from './extensionStoreSectionStyles';
import { buttonStyle, SectionLabel } from './settingsStyles';

export function DetailPanel({ model }: { model: ExtensionStoreModel }): React.ReactElement {
  const ext = model.selectedExtension!;
  const extId = `${ext.namespace}.${ext.name}`;
  const installedData = model.installedMap.get(extId);
  const isInstalled = model.installedMap.has(extId);
  const isDisabled = model.disabledIds.has(extId);
  const isInstalling = model.installInProgress === extId;
  return (
    <div style={Styles.detailContainerStyle}>
      <button
        onClick={model.clearSelection}
        className="text-interactive-accent"
        style={Styles.backButtonStyle}
      >
        &larr; Back to results
      </button>
      <ExtensionDetailHeader ext={ext} />
      <ExtensionStats ext={ext} />
      <ExtensionMetadata ext={ext} />
      <ExtensionActions
        ext={ext}
        extId={extId}
        isDisabled={isDisabled}
        isInstalled={isInstalled}
        isInstalling={isInstalling}
        model={model}
      />
      {installedData && <ContributionsSummary installed={installedData} />}{' '}
      {ext.readme && <ReadmeSection readme={ext.readme} />}
    </div>
  );
}

function ExtensionDetailHeader({
  ext,
}: {
  ext: NonNullable<ExtensionStoreModel['selectedExtension']>;
}): React.ReactElement {
  return (
    <div style={Styles.headerRowStyle}>
      {ext.icon ? (
        <img src={ext.icon} alt="" style={Styles.iconStyle} />
      ) : (
        <div style={Styles.iconPlaceholderStyle}>{getCategoryEmoji(ext.categories)}</div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={Styles.detailTitleRowStyle}>
          <span className="text-text-semantic-primary" style={Styles.detailTitleStyle}>
            {ext.displayName || ext.name}
          </span>
          <span className="text-text-semantic-muted" style={Styles.detailVersionStyle}>
            v{ext.version}
          </span>
        </div>
        <div className="text-text-semantic-muted" style={Styles.publisherStyle}>
          {ext.namespace}
        </div>
        {ext.description && (
          <p className="text-text-semantic-muted" style={Styles.detailDescriptionStyle}>
            {ext.description}
          </p>
        )}
      </div>
    </div>
  );
}

function ExtensionStats({
  ext,
}: {
  ext: NonNullable<ExtensionStoreModel['selectedExtension']>;
}): React.ReactElement {
  return (
    <div style={Styles.statsRowStyle}>
      <span className="text-text-semantic-muted" style={Styles.statStyle}>
        {formatDownloads(ext.downloads)} downloads
      </span>
      {ext.averageRating != null && (
        <span className="text-text-semantic-muted" style={Styles.statStyle}>
          {'\u2605'} {ext.averageRating.toFixed(1)}
        </span>
      )}
    </div>
  );
}

function ExtensionMetadata({
  ext,
}: {
  ext: NonNullable<ExtensionStoreModel['selectedExtension']>;
}): React.ReactElement {
  return (
    <div style={Styles.metadataContainerStyle}>
      {ext.categories && ext.categories.length > 0 && (
        <MetadataRow label="Categories" value={ext.categories.join(', ')} />
      )}
      {ext.repository && (
        <MetadataRow label="Repository">
          <a
            href={ext.repository}
            target="_blank"
            rel="noopener noreferrer"
            className="text-interactive-accent"
            style={Styles.linkStyle}
            onClick={(e) => {
              e.preventDefault();
              window.electronAPI?.openExternalLink?.(ext.repository!);
            }}
          >
            {ext.repository}
          </a>
        </MetadataRow>
      )}
    </div>
  );
}

function InstalledExtensionButtons({
  extId,
  isDisabled,
  model,
}: {
  extId: string;
  isDisabled: boolean;
  model: ExtensionStoreModel;
}): React.ReactElement {
  return (
    <div style={Styles.actionButtonRowStyle}>
      <button
        onClick={() => model.toggleEnabled(extId)}
        className="text-text-semantic-primary"
        style={buttonStyle}
      >
        {isDisabled ? 'Enable' : 'Disable'}
      </button>
      <button
        onClick={() => model.uninstall(extId)}
        className="text-status-error"
        style={Styles.dangerButtonStyle}
      >
        Uninstall
      </button>
    </div>
  );
}

function ExtensionActions({
  ext,
  extId,
  isInstalled,
  isDisabled,
  isInstalling,
  model,
}: {
  ext: NonNullable<ExtensionStoreModel['selectedExtension']>;
  extId: string;
  isInstalled: boolean;
  isDisabled: boolean;
  isInstalling: boolean;
  model: ExtensionStoreModel;
}): React.ReactElement {
  return (
    <div style={Styles.installAreaStyle}>
      {!isInstalled ? (
        <button
          onClick={() => model.install(ext.namespace, ext.name)}
          disabled={isInstalling}
          style={Styles.accentButtonStyle(isInstalling)}
        >
          {isInstalling ? 'Installing...' : 'Install'}
        </button>
      ) : (
        <InstalledExtensionButtons extId={extId} isDisabled={isDisabled} model={model} />
      )}
    </div>
  );
}

function MetadataRow({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}): React.ReactElement {
  return (
    <div style={Styles.metadataRowStyle}>
      <span className="text-text-semantic-muted" style={Styles.metadataLabelStyle}>
        {label}
      </span>
      {children ?? (
        <span className="text-text-semantic-primary" style={Styles.metadataValueStyle}>
          {value}
        </span>
      )}
    </div>
  );
}

function ContributionsSummary({
  installed,
}: {
  installed: InstalledVsxExtension;
}): React.ReactElement | null {
  const items = summarizeContributions(installed);
  if (items.length === 0) return null;
  return (
    <div style={Styles.contributionsContainerStyle}>
      <SectionLabel style={{ marginBottom: '6px' }}>Contributions</SectionLabel>
      <div style={Styles.contributionsBodyStyle}>
        {items.map((item) => (
          <div
            key={item}
            className="text-text-semantic-primary"
            style={Styles.contributionItemStyle}
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function ReadmeSection({ readme }: { readme: string }): React.ReactElement {
  return (
    <div style={Styles.readmeContainerStyle}>
      <SectionLabel style={{ marginBottom: '8px' }}>README</SectionLabel>
      <div style={Styles.readmeBodyStyle} className="ext-store-readme text-text-semantic-primary">
        <ReactMarkdown>{readme}</ReactMarkdown>
      </div>
    </div>
  );
}

function summarizeContributions(installed: InstalledVsxExtension): string[] {
  const contributes = installed.contributes;
  if (!contributes) return [];
  const parts: Array<[number | undefined, string]> = [
    [contributes.themes?.length, 'color theme'],
    [contributes.grammars?.length, 'grammar'],
    [contributes.snippets?.length, 'snippet file'],
    [contributes.languages?.length, 'language'],
  ];
  return parts.flatMap(([count, label]) =>
    count ? [`${count} ${label}${count !== 1 ? 's' : ''}`] : [],
  );
}

function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function getCategoryEmoji(categories?: string[]): string {
  if (!categories || categories.length === 0) return '\u{1F4E6}';
  const first = categories[0].toLowerCase();
  if (first.includes('theme')) return '\u{1F3A8}';
  if (first.includes('snippet')) return '\u{2702}';
  if (first.includes('language') || first.includes('programming')) return '\u{1F4DD}';
  if (first.includes('linter') || first.includes('formatter')) return '\u{1F9F9}';
  return '\u{1F4E6}';
}
