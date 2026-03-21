import React from 'react';
import type { AppConfig } from '../../types/electron';
import { ToggleSwitch } from './ToggleSwitch';
import { DefaultProjectFolder, RecentProjects } from './GeneralProjectSubsection';
import { NotificationsSubsection } from './GeneralNotificationsSubsection';
import { BackupSubsection } from './GeneralBackupSubsection';
import { LspSubsection } from './GeneralLspSubsection';
import { WebAccessSubsection } from './GeneralWebAccessSubsection';

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
      <NotificationsSubsection draft={draft} onChange={onChange} />
      <WebAccessSubsection draft={draft} onChange={onChange} />
      <BackupSubsection onImport={onImport} />
      <LspSubsection draft={draft} onChange={onChange} />
    </div>
  );
}
