/**
 * Layout Preset Engine — core types (Wave 17)
 *
 * Presets describe which components occupy which slots, default panel sizes,
 * and panel visibility. All fields are Partial so presets can override only
 * what they care about; resolution falls back to ide-primary defaults.
 *
 * ComponentDescriptor uses a string key (not a React ref) so presets are
 * JSON-serialisable and can be persisted in electron-store / Session records.
 * Wave 20 will register a resolver map that turns componentKey → ReactNode.
 */

/** The 6 named content slots in AppLayout (mirrors AppLayoutSlots). */
export type SlotName =
  | 'sidebarHeader'
  | 'sidebarContent'
  | 'editorTabBar'
  | 'editorContent'
  | 'agentCards'
  | 'terminalContent';

/** The 3 resizable panel dimensions tracked by useResizable. */
export type PanelId = 'leftSidebar' | 'rightSidebar' | 'terminal';

/**
 * A reference to a React component by string key.
 *
 * Wave 20 will maintain a registry mapping componentKey → factory function.
 * In Wave 17 this is opaque — the preset carries data, not logic.
 */
export interface ComponentDescriptor {
  /** Opaque key resolved by the Wave 20 component registry. */
  componentKey: string;
  /** Optional props forwarded to the resolved component. */
  props?: Record<string, unknown>;
}

/**
 * Responsive fallback rule — if the viewport is narrower than minWidth,
 * switch to fallbackPresetId. Wave 32 populates actual mobile rules.
 */
export interface ResponsiveRules {
  /** Minimum viewport width (px) at which this preset applies. */
  minWidth: number;
  /**
   * Preset ID to fall back to when the viewport is narrower than minWidth.
   * Must refer to a preset registered in BUILT_IN_PRESETS or a custom preset.
   */
  fallbackPresetId: string;
}

/**
 * A named layout configuration.
 *
 * All slot/size/visibility fields are Partial — missing keys inherit from
 * ide-primary defaults. `breakpoints` is optional; Wave 32 adds actual rules.
 */
export interface LayoutPreset {
  /** Stable identifier. Built-in presets use kebab-case (e.g. 'ide-primary'). */
  id: string;
  /** Display name shown in the layout switcher. */
  name: string;
  /**
   * Which component renders in each slot.
   * Omitted slots continue using their current population (no-op for Wave 17).
   */
  slots: Partial<Record<SlotName, ComponentDescriptor>>;
  /**
   * Default panel widths/heights (px).
   * Omitted panels use the useResizable defaults.
   */
  panelSizes: Partial<Record<PanelId, number>>;
  /**
   * Default panel visibility.
   * Omitted panels default to visible.
   */
  visiblePanels: Partial<Record<PanelId, boolean>>;
  /**
   * Responsive breakpoint rules. Wave 32 populates these for mobile-primary.
   * Undefined means "no responsive fallback" (desktop-only preset).
   */
  breakpoints?: ResponsiveRules;
}
