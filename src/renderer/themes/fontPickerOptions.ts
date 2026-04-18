/**
 * fontPickerOptions.ts — Curated font lists for per-pane font picker.
 *
 * Wave 35 Phase F. CSS fallback chains handle fonts not installed locally.
 */

export interface FontOption {
  id: string;
  label: string;
  value: string;
  category: 'mono' | 'ui';
}

export const MONO_FONTS: FontOption[] = [
  { id: 'default-mono', label: 'System default (mono)', value: 'var(--font-mono, monospace)',       category: 'mono' },
  { id: 'jetbrains',    label: 'JetBrains Mono',        value: '"JetBrains Mono", monospace',       category: 'mono' },
  { id: 'fira-code',    label: 'Fira Code',             value: '"Fira Code", monospace',            category: 'mono' },
  { id: 'cascadia',     label: 'Cascadia Code',         value: '"Cascadia Code", monospace',        category: 'mono' },
  { id: 'sf-mono',      label: 'SF Mono',               value: '"SF Mono", monospace',              category: 'mono' },
  { id: 'iosevka',      label: 'Iosevka',               value: 'Iosevka, monospace',                category: 'mono' },
  { id: 'menlo',        label: 'Menlo',                 value: 'Menlo, monospace',                  category: 'mono' },
  { id: 'consolas',     label: 'Consolas',              value: 'Consolas, monospace',               category: 'mono' },
];

export const UI_FONTS: FontOption[] = [
  { id: 'default-ui', label: 'System default (UI)', value: 'var(--font-ui, sans-serif)',            category: 'ui' },
  { id: 'inter',      label: 'Inter',               value: 'Inter, sans-serif',                    category: 'ui' },
  { id: 'system-ui',  label: 'System UI',           value: 'system-ui, sans-serif',                category: 'ui' },
  { id: 'ibm-plex',   label: 'IBM Plex Sans',       value: '"IBM Plex Sans", sans-serif',          category: 'ui' },
  { id: 'sf-pro',     label: 'SF Pro',              value: '"SF Pro Display", sans-serif',          category: 'ui' },
  { id: 'segoe',      label: 'Segoe UI',            value: '"Segoe UI", sans-serif',               category: 'ui' },
];
