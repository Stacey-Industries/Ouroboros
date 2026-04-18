/**
 * thinkingDefaults.ts — Default thinking verbs, spinner chars, and presets
 * for the ThinkingIndicator and the settings UI.
 *
 * Wave 35 Phase E.
 */

export const DEFAULT_THINKING_VERBS: readonly string[] = [
  'thinking',
  'reasoning',
  'cogitating',
  'pondering',
  'musing',
  'deliberating',
  'analyzing',
  'considering',
];

export const DEFAULT_SPINNER_CHARS = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';

export const SPINNER_PRESETS: Array<{ id: string; label: string; chars: string }> = [
  { id: 'braille', label: 'Braille', chars: '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏' },
  { id: 'dots',    label: 'Dots',    chars: '.oO°Oo.' },
  { id: 'line',    label: 'Line',    chars: '|/—\\' },
  { id: 'arc',     label: 'Arc',     chars: '◜◝◞◟' },
  { id: 'pulse',   label: 'Pulse',   chars: '●○' },
  { id: 'square',  label: 'Square',  chars: '◰◳◲◱' },
];
