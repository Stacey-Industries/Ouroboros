/**
 * ChatOnlySettingsOverlay — modal host for the Settings component in chat-only shell.
 *
 * Wave 44 Phase C. Listens for OPEN_SETTINGS_EVENT (Ctrl+,) and mounts the
 * existing SettingsModal in a full-screen overlay over the chat shell. The
 * SettingsModal renders into document.body via createPortal internally, so
 * no DOM stacking context issues.
 *
 * Settings is self-contained (useConfig, useSettingsDraft) — no IDE-only
 * context dependencies. Verified: SettingsModal uses only useConfig, which
 * calls window.electronAPI.config.getAll — available in chat-only.
 */

import React, { useCallback, useEffect, useState } from 'react';

import { OPEN_SETTINGS_EVENT } from '../../../hooks/appEventNames';
import { SettingsModal } from '../../Settings/SettingsModal';

export function ChatOnlySettingsOverlay(): React.ReactElement {
  const [open, setOpen] = useState(false);

  const handleOpen = useCallback((): void => {
    setOpen(true);
  }, []);
  const handleClose = useCallback((): void => {
    setOpen(false);
  }, []);

  useEffect(() => {
    window.addEventListener(OPEN_SETTINGS_EVENT, handleOpen);
    return () => {
      window.removeEventListener(OPEN_SETTINGS_EVENT, handleOpen);
    };
  }, [handleOpen]);

  return <SettingsModal isOpen={open} onClose={handleClose} />;
}
