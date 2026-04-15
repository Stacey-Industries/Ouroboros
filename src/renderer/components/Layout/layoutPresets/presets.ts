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
// mobile-primary — SCAFFOLD for Wave 32
//
// TODO(Wave 32): Populate slots for single-column mobile layout.
// TODO(Wave 32): Add breakpoints rule (minWidth:768 → ide-primary fallback).
// TODO(Wave 32): Hide leftSidebar + rightSidebar; terminal collapsed to header.
// ---------------------------------------------------------------------------

export const mobilePrimaryPreset: LayoutPreset = {
  id: 'mobile-primary',
  name: 'Mobile',
  // TODO(Wave 32): slot assignments for single-column layout
  slots: {},
  panelSizes: {},
  // TODO(Wave 32): visiblePanels — all sidebars hidden, terminal collapsed
  visiblePanels: {},
  // TODO(Wave 32): breakpoints — minWidth:768, fallbackPresetId:'ide-primary'
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
