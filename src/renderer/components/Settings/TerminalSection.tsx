import React, { useEffect, useState } from 'react';
import type { AppConfig } from '../../types/electron';
import {
  getDefaultShellForPlatform,
  TerminalSectionContent,
} from './TerminalSectionParts';

interface TerminalSectionProps {
  draft: AppConfig;
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
}

export function TerminalSection({ draft, onChange }: TerminalSectionProps): React.ReactElement {
  const [platform, setPlatform] = useState<NodeJS.Platform>('win32');

  useEffect(() => {
    void window.electronAPI.app.getPlatform().then((value) => setPlatform(value));
  }, []);

  useEffect(() => {
    if (draft.shell) {
      return;
    }

    void window.electronAPI.app.getPlatform().then((value) => {
      onChange('shell', getDefaultShellForPlatform(value));
    });
  }, [draft.shell, onChange]);

  return <TerminalSectionContent draft={draft} onChange={onChange} platform={platform} />;
}
