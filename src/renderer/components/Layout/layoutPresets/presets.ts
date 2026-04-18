/**
 * Built-in Layout Presets (Wave 17)
 *
 * Three presets are registered here:
 *   ide-primary    — fully populated; matches today's default layout
 *   chat-primary   — SCAFFOLD ONLY; Wave 20 populates slot assignments
 *   mobile-primary — SCAFFOLD ONLY; Wave 32 populates responsive rules + slots
 *
 * ComponentDescriptor keys use the component's export name so a Wave 20
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
// chat-primary — SCAFFOLD for Wave 20
//
// TODO(Wave 20): Populate slot assignments so chat occupies editorContent
//   and AgentCards moves to a collapsible right drawer. The rightSidebar max
//   width ceiling should be lifted (Piebald #4) for this preset.
// TODO(Wave 20): Set panelSizes.rightSidebar to ~480 (wider chat column).
// ---------------------------------------------------------------------------

export const chatPrimaryPreset: LayoutPreset = {
  id: 'chat-primary',
  name: 'Chat',
  slots: {
    sidebarHeader: { componentKey: 'ProjectPicker' },
    sidebarContent: { componentKey: 'SessionSidebar' },
    editorTabBar: { componentKey: 'EditorTabBar' },
    editorContent: { componentKey: 'AgentChatWorkspace' },
    agentCards: { componentKey: 'AgentSidebarContent' },
    terminalContent: { componentKey: 'TerminalManager' },
  },
  // Wider left sidebar for session list; wider right for chat column.
  panelSizes: {
    leftSidebar: 260,
    rightSidebar: 480,
    terminal: 200,
  },
  // Terminal collapsed by default — chat is the primary surface.
  visiblePanels: {
    leftSidebar: true,
    rightSidebar: true,
    terminal: false,
  },
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
export const BUILT_IN_PRESETS: LayoutPreset[] = [
  idePrimaryPreset,
  chatPrimaryPreset,
  mobilePrimaryPreset,
];

/**
 * Resolve a preset by ID from the built-in registry.
 * Returns `idePrimaryPreset` if no match is found.
 */
export function resolveBuiltInPreset(id: string | undefined): LayoutPreset {
  if (!id) return idePrimaryPreset;
  return BUILT_IN_PRESETS.find((p) => p.id === id) ?? idePrimaryPreset;
}
