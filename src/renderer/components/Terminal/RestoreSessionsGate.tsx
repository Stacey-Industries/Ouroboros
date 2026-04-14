/**
 * RestoreSessionsGate — lazy-loaded connector between usePersistedTerminalSessions
 * and RestoreSessionsDialog. Mounted once at startup inside InnerAppLayout.
 *
 * Dismissed (×) does NOT discard — sessions stay in the store.
 * Only "Discard all" wipes the store.
 */

import React, { useState } from 'react';

import { usePersistedTerminalSessions } from '../../hooks/usePersistedTerminalSessions';
import { RestoreSessionsDialog } from './RestoreSessionsDialog';

export function RestoreSessionsGate(): React.ReactElement | null {
  const { sessions, isLoading, restore, restoreAll, discardAll } =
    usePersistedTerminalSessions();
  const [dismissed, setDismissed] = useState(false);

  if (isLoading || dismissed || sessions.length === 0) return null;

  function handleRestoreAll(): void {
    void restoreAll();
    setDismissed(true);
  }

  function handleRestoreSelected(ids: string[]): void {
    void Promise.all(ids.map((id) => restore(id)));
    setDismissed(true);
  }

  function handleDiscard(): void {
    void discardAll();
    setDismissed(true);
  }

  return (
    <RestoreSessionsDialog
      sessions={sessions}
      onRestoreAll={handleRestoreAll}
      onRestoreSelected={handleRestoreSelected}
      onDiscard={handleDiscard}
      onDismiss={() => setDismissed(true)}
    />
  );
}
