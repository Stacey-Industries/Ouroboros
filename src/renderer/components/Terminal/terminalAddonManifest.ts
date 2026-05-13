/**
 * Terminal Addon Manifest — typed declaration of all @xterm/addon-* packages
 *
 * This manifest declares every xterm addon the project depends on, including load order
 * and criticality. Used by Phase 1 to centralize addon loading logic and by future audits
 * to track which addons are active.
 */

export interface TerminalAddonEntry {
  /** npm package name, e.g. '@xterm/addon-webgl' */
  packageName: string;
  /** Constructor export name from the package, e.g. 'WebglAddon' */
  exportName: string;
  /** Whether the addon must load before or after term.open(). WebGL is post-open per Wave 88 Decision 1. */
  loadOrder: 'pre-open' | 'post-open';
  /** Whether failure to load is fatal (throws) or graceful (warn + continue) */
  required: boolean;
  /** One-line description of what this addon contributes. Future agents grep this. */
  purpose: string;
}

export const TERMINAL_ADDONS: readonly TerminalAddonEntry[] = [
  {
    packageName: '@xterm/addon-clipboard',
    exportName: 'ClipboardAddon',
    loadOrder: 'post-open',
    required: false,
    purpose: 'Clipboard support for copy/paste operations.',
  },
  {
    packageName: '@xterm/addon-fit',
    exportName: 'FitAddon',
    loadOrder: 'pre-open',
    required: true,
    purpose: 'Fits terminal size to container dimensions on resize.',
  },
  {
    packageName: '@xterm/addon-image',
    exportName: 'ImageAddon',
    loadOrder: 'post-open',
    required: false,
    purpose: 'Sixel and iTerm2 image protocol support.',
  },
  {
    packageName: '@xterm/addon-progress',
    exportName: 'ProgressAddon',
    loadOrder: 'post-open',
    required: false,
    purpose: 'OSC 9001 progress bar rendering in title bar.',
  },
  {
    packageName: '@xterm/addon-search',
    exportName: 'SearchAddon',
    loadOrder: 'pre-open',
    required: true,
    purpose: 'Keyboard search (Ctrl+F) across terminal buffer.',
  },
  {
    packageName: '@xterm/addon-serialize',
    exportName: 'SerializeAddon',
    loadOrder: 'post-open',
    required: false,
    purpose: 'Serializes terminal state to JSON for session snapshots.',
  },
  {
    packageName: '@xterm/addon-unicode-graphemes',
    exportName: 'UnicodeGraphemesAddon',
    loadOrder: 'post-open',
    required: false,
    purpose: 'Grapheme-cluster-aware Unicode rendering (emoji, combining marks).',
  },
  {
    packageName: '@xterm/addon-web-links',
    exportName: 'WebLinksAddon',
    loadOrder: 'pre-open',
    required: false,
    purpose: 'Detects and linkifies URLs in terminal output.',
  },
  {
    packageName: '@xterm/addon-webgl',
    exportName: 'WebglAddon',
    loadOrder: 'post-open',
    required: false,
    purpose: 'GPU-accelerated rendering via WebGL; falls back to canvas on context loss.',
  },
];
