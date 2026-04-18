/**
 * MobileLayoutContext.tsx
 *
 * Surfaces the mobileActivePanel state (owned by useMobileActivePanel) via
 * React context so any descendant can read or update the active panel without
 * prop-drilling through the layout tree.
 *
 * Wave 32 Phase D — mobile panel state lift to context.
 */

import React, { createContext, useContext, useMemo } from 'react';

import type { MobileActivePanelValue } from '../hooks/useMobileActivePanel';
import { useMobileActivePanel } from '../hooks/useMobileActivePanel';

const MobileLayoutContext = createContext<MobileActivePanelValue | null>(null);

export function MobileLayoutProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const value = useMobileActivePanel();
  const memoized = useMemo<MobileActivePanelValue>(
    () => ({ activePanel: value.activePanel, setActivePanel: value.setActivePanel }),
    [value.activePanel, value.setActivePanel],
  );
  return (
    <MobileLayoutContext.Provider value={memoized}>
      {children}
    </MobileLayoutContext.Provider>
  );
}

export function useMobileLayout(): MobileActivePanelValue {
  const ctx = useContext(MobileLayoutContext);
  if (!ctx) throw new Error('useMobileLayout must be used inside <MobileLayoutProvider>');
  return ctx;
}
