/**
 * VS Code color key → Ouroboros CSS custom property name.
 *
 * Keys are the VS Code theme `colors` object keys.
 * Values are CSS custom property names defined in tokens.css (Tier 2 semantic tokens).
 *
 * Only tokens that exist in tokens.css are included — see verification note below.
 * Drop a mapping here if the target token is removed from tokens.css.
 */
export const VS_CODE_COLOR_MAP: Record<string, string> = {
  // Editor
  'editor.background':              '--surface-base',
  'editor.foreground':              '--text-primary',
  'editor.lineHighlightBackground': '--surface-hover',
  'editor.selectionBackground':     '--interactive-selection',
  'editorCursor.foreground':        '--interactive-accent',

  // Editor widgets / overlays
  'editorWidget.background': '--surface-overlay',
  'editorWidget.border':     '--border-default',

  // Activity bar
  'activityBar.background': '--surface-panel',
  'activityBar.foreground': '--text-primary',

  // Side bar
  'sideBar.background':                '--surface-raised',
  'sideBar.foreground':                '--text-primary',
  'sideBarSectionHeader.background':   '--surface-panel',

  // Status bar
  'statusBar.background': '--surface-panel',
  'statusBar.foreground': '--text-secondary',

  // Title bar
  'titleBar.activeBackground': '--surface-panel',
  'titleBar.activeForeground': '--text-primary',

  // Tabs
  'tab.activeBackground':   '--surface-base',
  'tab.activeForeground':   '--text-primary',
  'tab.inactiveBackground': '--surface-panel',
  'tab.inactiveForeground': '--text-muted',

  // Buttons
  'button.background':      '--interactive-accent',
  'button.foreground':      '--text-on-accent',
  'button.hoverBackground': '--interactive-hover',

  // Inputs
  'input.background': '--surface-inset',
  'input.foreground': '--text-primary',
  'input.border':     '--border-subtle',

  // Focus / foreground globals
  'focusBorder':          '--border-accent',
  'foreground':           '--text-primary',
  'descriptionForeground': '--text-secondary',
  'errorForeground':      '--status-error',

  // Dropdowns
  'dropdown.background': '--surface-overlay',
  'dropdown.foreground': '--text-primary',

  // Lists
  'list.activeSelectionBackground': '--interactive-selection',
  'list.activeSelectionForeground': '--text-primary',
  'list.hoverBackground':           '--surface-hover',

  // Scrollbar
  'scrollbarSlider.background':       '--surface-scroll-thumb',
  'scrollbarSlider.hoverBackground':  '--surface-scroll-thumb',
  'scrollbarSlider.activeBackground': '--surface-scroll-thumb',

  // Badges
  'badge.background': '--interactive-accent-subtle',
  'badge.foreground': '--text-on-accent',

  // Notifications
  'notifications.background': '--surface-overlay',
  'notifications.foreground': '--text-primary',
};
