import React from 'react';

import type { AppConfig } from '../../types/electron';
import { BackupSubsection } from './GeneralBackupSubsection';
import { LspSubsection } from './GeneralLspSubsection';
import { NotificationsSubsection } from './GeneralNotificationsSubsection';
import { DefaultProjectFolder, RecentProjects } from './GeneralProjectSubsection';
import { SemanticSearchSubsection } from './GeneralSemanticSearchSubsection';
import { WebAccessSubsection } from './GeneralWebAccessSubsection';
import { DeveloperFlagsSubsection } from './SettingsDeveloperFlagsSubsection';
import { ToggleSwitch } from './ToggleSwitch';

interface GeneralSectionProps {
  draft: AppConfig;
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
  onImport?: (imported: AppConfig) => void;
}

export function GeneralSection({ draft, onChange, onImport }: GeneralSectionProps): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <DefaultProjectFolder draft={draft} onChange={onChange} />
      <RecentProjects draft={draft} onChange={onChange} />
      <section>
        <ToggleSwitch
          checked={draft.autoInstallHooks}
          onChange={(val) => onChange('autoInstallHooks', val)}
          label="Auto-install hook scripts"
          description="Automatically copies Claude Code hook scripts to ~/.claude/hooks/ on launch."
        />
      </section>
      <section>
        <ToggleSwitch
          checked={draft.layout?.chatPrimary === true}
          onChange={(val) => onChange('layout', { ...(draft.layout ?? {}), chatPrimary: val })}
          label="Start in chat mode"
          description="Launches the IDE with the chat-primary layout preset. Equivalent to opening a dedicated chat window, but in the main window. Takes effect on next launch or reload."
        />
      </section>
      <section>
        <ToggleSwitch
          checked={draft.layout?.immersiveChat === true}
          onChange={(val) => onChange('layout', { ...(draft.layout ?? {}), immersiveChat: val })}
          label="Immersive chat mode"
          description="Replaces the IDE shell with a single-column chat interface. Same backend, same features."
        />
      </section>
      <NotificationsSubsection draft={draft} onChange={onChange} />
      <WebAccessSubsection draft={draft} onChange={onChange} />
      <BackupSubsection onImport={onImport} />
      <LspSubsection draft={draft} onChange={onChange} />
      <SemanticSearchSubsection draft={draft} onChange={onChange} />
      <DeveloperFlagsSubsection draft={draft} onChange={onChange} />
    </div>
  );
}
