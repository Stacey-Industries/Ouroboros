/**
 * Built-in Layout Presets (Wave 17)
 *
 * Two presets are registered here:
 *   ide-primary    — fully populated; matches today's default layout
 *   mobile-primary — Wave 32 populates responsive rules + slots
 *
 * Wave 43 Phase A: chat-primary preset retired. Users who had layout.chatPrimary
 * are migrated to layout.immersiveChat on first load (see src/main/config.ts).
 *
 * ComponentDescriptor keys use the component's export name so a future
 * registry can resolve them without importing React components at this layer.
 */

import type { LayoutPreset } from './types';

// ---------------------------------------------------------------------------
// ide-primary — current default layout
// Panel sizes match useResizable DEFAULT_SIZES (leftSidebar:220, rightSidebar:300, terminal:280)
// ---------------------------------------------------------------------------

export const idePrimaryPreset: LayoutPreset = {
  id: 'ide-primary',
  name: 'IDE',
  slots: {
    sidebarHeader: { componentKey: 'ProjectPicker' },
    sidebarContent: { componentKey: 'SidebarSections' },
    editorTabBar: { componentKey: 'EditorTabBar' },
    editorContent: { componentKey: 'CentrePaneConnected' },
    agentCards: { componentKey: 'AgentSidebarContent' },
    terminalContent: { componentKey: 'TerminalManager' },
  },
  panelSizes: {
    leftSidebar: 220,
    rightSidebar: 300,
    terminal: 280,
  },
  visiblePanels: {
    leftSidebar: true,
    rightSidebar: true,
    terminal: true,
  },
  // No responsive breakpoints for the default desktop layout.
};

// ---------------------------------------------------------------------------
// mobile-primary — Wave 32 (populated Phase B)
//
// Single-column layout for phone viewports. All panels are mounted (state
// preservation) but sidebars are hidden and terminal is collapsed to its
// 32px header strip. The active surface is switched by the MobileNavBar
// via `data-mobile-active` attribute + mobile.css — the preset just records
// intent; CSS does the work.
//
// Breakpoint rule: when viewport widens past 768px, fall back to ide-primary.
// ---------------------------------------------------------------------------

export const mobilePrimaryPreset: LayoutPreset = {
  id: 'mobile-primary',
  name: 'Mobile',
  slots: {
    sidebarHeader: { componentKey: 'ProjectPicker' },
    sidebarContent: { componentKey: 'SidebarSections' },
    editorTabBar: { componentKey: 'EditorTabBar' },
    editorContent: { componentKey: 'CentrePaneConnected' },
    agentCards: { componentKey: 'AgentSidebarContent' },
    terminalContent: { componentKey: 'TerminalManager' },
  },
  panelSizes: {
    leftSidebar: 0,
    rightSidebar: 0,
    terminal: 32,
  },
  visiblePanels: {
    leftSidebar: false,
    rightSidebar: false,
    terminal: false,
  },
  breakpoints: {
    minWidth: 768,
    fallbackPresetId: 'ide-primary',
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** All built-in presets in priority order (ide-primary is the default). */
export const BUILT_IN_PRESETS: LayoutPreset[] = [idePrimaryPreset, mobilePrimaryPreset];

/**
 * Resolve a preset by ID from the built-in registry.
 * Returns `idePrimaryPreset` if no match is found.
 */
export function resolveBuiltInPreset(id: string | undefined): LayoutPreset {
  if (!id) return idePrimaryPreset;
  return BUILT_IN_PRESETS.find((p) => p.id === id) ?? idePrimaryPreset;
}
