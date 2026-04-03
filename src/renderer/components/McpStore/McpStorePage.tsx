/**
 * McpStorePage.tsx — Unified MCP server store page with Browse/Installed tabs.
 * Rendered as a centre-pane SpecialView. Accepts optional deep-link tab via event detail.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { OPEN_MCP_STORE_EVENT } from '../../hooks/appEventNames';
import { StorePageShell,type StoreTab } from '../StorePageShell';
import { McpSection } from './McpSection';
import { McpStoreSection } from './McpStoreSection';

const noop = (): void => {};

export function McpStorePage(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<StoreTab>('browse');
  const refreshRef = useRef<() => void>(noop);

  const registerRefresh = useCallback((fn: () => void) => {
    refreshRef.current = fn;
  }, []);

  const handleRefresh = useCallback(() => {
    refreshRef.current();
  }, []);

  useDeepLinkTab(OPEN_MCP_STORE_EVENT, setActiveTab);

  return (
    <StorePageShell
      title="MCP Servers"
      subtitle="Discover, install, and configure MCP servers"
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onRefresh={handleRefresh}
    >
      {activeTab === 'browse'
        ? <McpStoreSection onRegisterRefresh={registerRefresh} />
        : <McpSection onRegisterRefresh={registerRefresh} />}
    </StorePageShell>
  );
}

/** Listens for repeated open events with an optional `{ tab }` payload. */
function useDeepLinkTab(
  eventName: string,
  setTab: (tab: StoreTab) => void,
): void {
  useEffect(() => {
    function handler(e: Event): void {
      const detail = (e as CustomEvent<{ tab?: StoreTab }>).detail;
      if (detail?.tab) setTab(detail.tab);
    }
    window.addEventListener(eventName, handler);
    return () => window.removeEventListener(eventName, handler);
  }, [eventName, setTab]);
}
