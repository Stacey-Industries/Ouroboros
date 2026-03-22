/**
 * GeneralNotificationsSubsection.tsx — Agent notification settings.
 */

import React from 'react';
import type { AppConfig, NotificationSettings } from '../../types/electron';
import { ToggleSwitch } from './ToggleSwitch';
import { SectionLabel } from './settingsStyles';

interface Props {
  draft: AppConfig;
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
}

export function NotificationsSubsection({ draft, onChange }: Props): React.ReactElement {
  const notifications = draft.notifications ?? { level: 'all', alwaysNotify: false };

  function handleLevelChange(e: React.ChangeEvent<HTMLSelectElement>): void {
    const current: NotificationSettings = draft.notifications ?? { level: 'all', alwaysNotify: false };
    onChange('notifications', { ...current, level: e.target.value });
  }

  function handleAlwaysNotify(val: boolean): void {
    const current: NotificationSettings = draft.notifications ?? { level: 'all', alwaysNotify: false };
    onChange('notifications', { ...current, alwaysNotify: val });
  }

  return (
    <section>
      <SectionLabel>Agent Notifications</SectionLabel>
      <p className="text-text-semantic-muted" style={descStyle}>
        Desktop notifications when agent sessions complete or encounter errors.
      </p>
      <div style={levelRowStyle}>
        <label htmlFor="notif-level" className="text-text-semantic-secondary" style={levelLabelStyle}>Notification level</label>
        <select id="notif-level" value={notifications.level} onChange={handleLevelChange} className="text-text-semantic-primary" style={selectStyle}>
          <option value="all">All (complete + errors)</option>
          <option value="errors-only">Errors only</option>
          <option value="none">None</option>
        </select>
      </div>
      <ToggleSwitch
        checked={notifications.alwaysNotify}
        onChange={handleAlwaysNotify}
        label="Always notify"
        description="Show desktop notifications even when the app window is focused."
      />
    </section>
  );
}

const descStyle: React.CSSProperties = { fontSize: '12px', marginBottom: '12px' };
const levelRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' };
const levelLabelStyle: React.CSSProperties = { fontSize: '12px', whiteSpace: 'nowrap' };

const selectStyle: React.CSSProperties = {
  flex: 1, maxWidth: '200px', padding: '6px 10px', borderRadius: '6px',
  border: '1px solid var(--border)', background: 'var(--bg-tertiary)',
  fontSize: '12px', fontFamily: 'var(--font-ui)', cursor: 'pointer',
};
